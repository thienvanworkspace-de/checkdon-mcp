import test from "node:test";
import assert from "node:assert/strict";
import { CatalogCache } from "../src/cache/catalog-cache.js";
import { emptyCatalog, createMcpServices } from "../src/container.js";
import { promotionPolicyParse } from "../src/business/promotion/promotion-policy-parser.js";
import { calculatePromotion } from "../src/business/promotion/calculate-promotion.js";

const order = { order_number: "DH1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 3, unit_price: 0.1 }] };
const invoice = { invoice_number: "HD1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 3, unit_price: 0.1, amount: 0.3, net_amount: 0.3 }], net_amount: 0.3 };
const catalog = () => ({ ...emptyCatalog(), customers: [{ id: 1, code: "KH1", isActive: 1 }],
    products: [{ id: 1, code: "SP1", isActive: 1, unitPrice: "0.10" }] });

test("cache công bố nguyên snapshot, không lộ cấu trúc cho caller mutate", async () => {
    let data = catalog();
    const cache = new CatalogCache({ catalogRepository: { loadAll: async () => data } });
    assert.throws(() => cache.getSnapshot(), /chưa sẵn sàng/);
    await cache.refresh();
    const previous = cache.getSnapshot();
    assert.throws(() => { previous.products[0].unitPrice = "100"; }, TypeError);
    data = catalog(); data.products[0].unitPrice = "0.20";
    await cache.refresh();
    assert.equal(previous.product("SP1").unitPrice, "0.10");
    assert.equal(cache.getSnapshot().product("SP1").unitPrice, "0.20");
});

test("check MCP chỉ đọc RAM; Decimal không báo sai 3 × 0.1 = 0.3", async () => {
    let reads = 0;
    const cache = new CatalogCache({ catalogRepository: { loadAll: async () => { reads++; return catalog(); } } });
    await cache.refresh();
    const service = createMcpServices({ catalogCache: cache }).invoiceService;
    for (let i = 0; i < 3; i++) {
        const result = await service.checkInvoice({ order, invoice });
        assert.equal(result.message_code, "CHECK_RESULT");
        assert.deepEqual(result.errors, []);
    }
    assert.equal(reads, 1);
    cache.invalidate();
    assert.equal((await service.checkInvoice({ order, invoice })).message_code, "CATALOG_NOT_READY");
});

test("không tự áp thứ tự ưu tiên giá/chiết khấu/KM", async () => {
    const data = catalog();
    data.specificPrices = [{ customerId: 1, productId: 1, unitPrice: "0.20", promotionPolicy: "mua 10 tặng 2" }];
    data.hospitalPrices = [{ customerId: 1, productId: 1, unitPrice: "0.30", soldQuantity: "2.000" }];
    const cache = new CatalogCache({ catalogRepository: { loadAll: async () => data } });
    await cache.refresh();
    const result = await createMcpServices({ catalogCache: cache }).invoiceService.checkOrder({ order });
    assert.equal(result.requires_review, true);
    assert.equal(result.references[0].hospitalPrices[0].unitPrice, "0.30");
    assert.ok(result.warnings.some(row => row.code === "POLICY_CONFIRMATION_REQUIRED"));
    assert.ok(!result.errors.some(row => row.error_code === "PRICE_MISMATCH"));
});

test("giữ thuật toán gốc: bậc lớn trước và tặng theo tỷ lệ phần dư", () => {
    const rules = promotionPolicyParse("mua 100 tặng 30; mua 20 tặng 5; mua 10 tặng 2");
    assert.equal(calculatePromotion(336, rules), 98);
    assert.equal(calculatePromotion(5, [{ buy: 10, present: 2 }]), 1);
    assert.equal(calculatePromotion(5, [{ buyQuantity: 10, giftQuantity: 2 }]), 1);
    assert.throws(() => promotionPolicyParse("mua 0 tặng 2"));
    assert.throws(() => calculatePromotion(-1, rules));
});

test("cache patch thêm/sửa bản ghi và ngày immutable mà không full load lại", async () => {
    let loads = 0;
    const cache = new CatalogCache({ catalogRepository: { loadAll: async () => { loads++; return catalog(); } } });
    await cache.refresh();
    const previous = cache.getSnapshot();
    await cache.applyChanges({ products: [{ id: 1, code: "SP1", unitPrice: "0.20", updatedAt: new Date("2026-10-31T00:00:00Z") },
        { id: 2, code: "SP2", unitPrice: "0.30" }] });
    assert.equal(loads, 1);
    assert.equal(previous.product("SP1").unitPrice, "0.10");
    assert.equal(cache.getSnapshot().product("SP1").updatedAt, "2026-10-31T00:00:00.000Z");
    assert.equal(cache.getSnapshot().product("SP2").unitPrice, "0.30");
});
