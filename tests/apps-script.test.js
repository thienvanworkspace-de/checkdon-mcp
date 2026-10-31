import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseSyncEvent } from "../src/business/sync/schemas.js";

async function script(properties = {}) {
    const scope = { PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) } };
    runInNewContext(await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), scope);
    return scope;
}
function parse(entity, row) {
    return parseSyncEvent({ eventId: "test", spreadsheetId: "book", entity, version: 1, row: JSON.parse(JSON.stringify(row)) }).row;
}

test("mapping Sheet cũ đi qua canonical schema mới, phần trăm và Không KM không bị đảo", async () => {
    const scope = await script();
    const customer = scope.mapRow("customers", ["Mã KH", "Khách hàng", "Địa chỉ", "Tỉnh", "Phân loại", "Không KM", "Khách PXK", "Địa chỉ PXK"],
        ["KH1", "Khách", "ĐC", "HCM", 1, true, "Tên PXK", "ĐC PXK"], []);
    assert.equal(parse("customers", customer).features.isPromoted, 0);
    const product = scope.mapRow("products", ["Mã SP", "Sản phẩm", "ĐVT", "Giá", "Khuyến mãi", "Chiết khấu"],
        ["SP1", "Thuốc", "Hộp", 100000, "mua 10 tặng 2", 0.05], ["", "", "", "", "", "0%"]);
    assert.equal(parse("products", product).discountRate, "5");
    const price = scope.mapRow("specificPrices", ["Mã KH", "Khách hàng", "Mã SP", "Sản phẩm", "Đơn giá", "Chiết khấu", "Khuyến mãi"],
        ["KH1", "Khách", "SP1", "Thuốc", 90000, 5, "mua 5 tặng 1"], Array(7).fill(""));
    assert.equal(parse("specificPrices", price).promotionPolicy, "mua 5 tặng 1");
});

test("đổi tên cột qua mapping không đổi model; schema chặn payload lạ/quan hệ bằng ID", async () => {
    const scope = await script({ HEADER_ALIASES: JSON.stringify({ products: { "Mã SP": "Mã mới" } }) });
    const row = scope.mapRow("products", ["Mã mới", "Sản phẩm", "ĐVT", "Giá", "Khuyến mãi", "Chiết khấu"],
        ["SP2", "Thuốc", "Hộp", 100, "", 0], Array(6).fill(""));
    assert.equal(parse("products", row).code, "SP2");
    assert.throws(() => parse("specificPrices", { customerId: 1, productId: 1 }));
});

test("hạn dùng giữ độ chính xác gốc; bệnh viện giữ Đã bán; đơn hỗ trợ hai layout", async () => {
    const scope = await script();
    const lot = scope.mapRow("productLots", ["Mã SP", "Sản phẩm", "Số lô", "Date"], ["SP1", "Thuốc", "L1", "12/2027"], [], ["SP1", "Thuốc", "L1", "12/2027"]);
    assert.equal(parse("productLots", lot).expiryDate, "12/2027");
    const hospital = scope.mapRow("hospitalPrices", ["Mã KH", "Khách hàng", "Mã SP", "Sản phẩm", "Đơn giá", "Chiết khấu", "Đã bán"],
        ["KH1", "Khách", "SP1", "Thuốc", 100, 0, 15], Array(7).fill(""));
    assert.equal(parse("hospitalPrices", hospital).soldQuantity, "15");
    const accounting = await script({ ORDER_SHEET_LAYOUT: "accounting" });
    const oldOrder = accounting.mapRow("orders", ["Nội dung", "Trạng thái", "Ngày", "Bổ sung", "Checked", "Orders_checked", "_order_key"],
        ["Đơn", "Đang xử lý", "31/10/2026", "BS", false, "[]", "sheet:abc"], []);
    assert.equal(parse("orders", oldOrder).content, "Đơn");
});
