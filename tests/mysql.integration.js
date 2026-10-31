import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createHmac } from "node:crypto";
import { Sequelize } from "sequelize";
import { createModels } from "../src/infrastructure/mysql/model-factory.js";
import { createApplicationContainer } from "../src/container.js";
import { loadConfig } from "../src/config/index.js";
import { startRuntime } from "../src/runtime.js";
import { createApp } from "../src/http/app.js";
import { SheetSyncService } from "../src/business/sync/sheet-sync-service.js";
import { OrderProjectionWorker } from "../src/infrastructure/projection/order-projection-worker.js";
import { OrderSheetRepository } from "../src/data/google-sheets/order-sheet-repository.js";
import { GoogleSheetsGateway } from "../src/infrastructure/google-sheets/google-sheets-gateway.js";
import { fakeSheets } from "./fake-sheets.js";

// Chỉ chạy riêng với MySQL container local có dữ liệu test dùng một lần; không đọc DB_* hay .env.
if (!process.env.TEST_MYSQL_PORT) throw new Error("Cần TEST_MYSQL_PORT của container MySQL kiểm thử local.");
const port = Number(process.env.TEST_MYSQL_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Cổng kiểm thử không hợp lệ.");
const sequelize = new Sequelize("checkdon_test", "root", "local-test-only", {
    host: "127.0.0.1", port, dialect: "mysql", logging: false, pool: { max: 5, min: 0 }
});
const models = createModels(sequelize);
const logger = { info() {}, warn() {}, error() {} };
const secret = "local-webhook-test-secret-32-characters";
const event = (entity, row, version = 1) => ({ eventId: `${entity}-${version}-${row.code ?? row.key ?? "test"}`, spreadsheetId: "book", entity, row, version });

test("MySQL 8 integration: schema, transaction, cache, webhook, outbox, archive", { timeout: 60_000 }, async t => {
    t.after(() => sequelize.close());
    for (let attempt = 0; ; attempt++) {
        try { await sequelize.authenticate(); break; }
        catch (error) { if (attempt >= 40) throw error; await delay(500); }
    }
    // Chỉ xóa các bảng trong database checkdon_test của container do task tạo.
    await sequelize.drop();
    const sql = await readFile(new URL("../migrations/001-initial.sql", import.meta.url), "utf8");
    for (const statement of sql.split(/;\s*(?:\n|$)/).filter(text => text.trim())) await sequelize.query(statement);
    const config = loadConfig({ DATA_PROVIDER: "mysql", SHEET_SYNC_SECRET: secret, CHECKDON_WORKBOOK_ID: "book" });
    const fake = fakeSheets();
    const gateway = new GoogleSheetsGateway({ client: fake.client });
    const sheet = new OrderSheetRepository({ gateway, workbookId: "book" });
    const container = createApplicationContainer({ config, logger, overrides: { sequelize, models,
        orderSheetRepositoryFactory: async () => sheet } });
    const services = container.cradle;
    await services.catalogCache.refresh();
    const sync = services.sheetSyncService;

    await t.test("schema orders và orders_ok giống nhau; unique và FK thực sự tồn tại", async () => {
        assert.deepEqual(Object.keys(models.Order.getAttributes()), Object.keys(models.OrderOk.getAttributes()));
        await assert.rejects(models.SpecificPrice.create({ customerId: 999, productId: 999, unitPrice: "1" }));
    });
    await t.test("đồng bộ khách + features nguyên tử, sản phẩm và cache cùng cập nhật", async () => {
        await sync.accept(event("customers", { code: "KH1", name: "Khách", isActive: 1,
            features: { isPromoted: 0, nameOnGoodsIssueInvoice: "Tên PXK" } }));
        await sync.accept(event("products", { code: "SP1", name: "Thuốc", unitPrice: "100.00", isActive: 1 }));
        assert.equal(await models.Customer.count(), 1);
        assert.equal(await models.CustomerFeature.count(), 1);
        assert.equal(services.catalogCache.getSnapshot().customer("KH1").name, "Khách");
    });
    await t.test("version theo từng dòng: cũ/trùng không ghi đè, các dòng khác không mất update", async () => {
        const newest = event("customers", { code: "KH1", name: "Tên mới", isActive: 1 }, 3);
        await sync.accept(newest);
        assert.equal((await sync.accept(newest)).applied, false);
        assert.equal((await sync.accept(event("customers", { code: "KH1", name: "Tên cũ" }, 2))).applied, false);
        await sync.accept(event("customers", { code: "KH2", name: "Khách 2" }, 1));
        assert.equal(services.catalogCache.getSnapshot().customer("KH1").name, "Tên mới");
        assert.ok(services.catalogCache.getSnapshot().customer("KH2"));
        await assert.rejects(sync.accept(event("customers", { code: "KH1", name: "Đụng version" }, 3)), { code: "VERSION_CONFLICT" });
    });
    await t.test("thiếu cha rollback cursor; retry sau khi có dữ liệu cha thành công", async () => {
        const before = await models.SyncCursor.count();
        const price = event("specificPrices", { customerCode: "KH1", productCode: "SP2", unitPrice: "90.00", promotionPolicy: "mua 10 tặng 2" });
        await assert.rejects(sync.accept(price), { code: "REFERENCE_NOT_FOUND" });
        assert.equal(await models.SyncCursor.count(), before);
        await sync.accept(event("products", { code: "SP2", name: "SP2", unitPrice: "100" }));
        await sync.accept(price);
        assert.equal(await models.SpecificPrice.count(), 1);
    });
    await t.test("cache lỗi sau commit: không báo ready giả; duplicate retry khôi phục cache", async () => {
        const cache = services.catalogCache;
        const refresh = cache.refresh.bind(cache);
        let fail = true;
        const flakyCache = { get ready() { return cache.ready; }, invalidate: () => cache.invalidate(),
            async refresh() { if (fail) { fail = false; throw new Error("cache lỗi"); } return refresh(); } };
        const service = new SheetSyncService({ sheetSyncRepository: services.sheetSyncRepository, catalogCache: flakyCache,
            syncConfig: config.sync, orderReconciliationService: services.orderReconciliationService });
        const input = event("products", { code: "SP3", name: "SP3", unitPrice: "5" });
        await assert.rejects(service.accept(input), /cache lỗi/);
        assert.equal(await models.Product.count({ where: { code: "SP3" } }), 1);
        assert.throws(() => cache.getSnapshot());
        assert.equal((await service.accept(input)).cacheReady, true);
    });
    await t.test("giá bệnh viện, hạn dùng và chương trình giữ dữ liệu; MCP không SELECT thêm", async () => {
        await sync.accept(event("hospitalPrices", { customerCode: "KH1", productCode: "SP1", unitPrice: "80", soldQuantity: "15.5" }));
        await sync.accept(event("productLots", { productCode: "SP1", lotNumber: "L1", expiryDate: "12/2027" }));
        await sync.accept(event("programPromotions", { sourceKey: "uuid-1", productCode: "SP1", promotionPolicy: "mua 10 tặng 2", fromDate: "2026-10-01", toDate: "2026-12-31" }));
        const original = services.catalogRepository.loadAll;
        services.catalogRepository.loadAll = () => { throw new Error("Không được load lại DB trong tool"); };
        try {
            await sync.accept(event("products", { code: "SPPATCH", name: "Không full load", unitPrice: "10" }));
            assert.ok(services.catalogCache.getSnapshot().product("SPPATCH"));
            const result = await services.invoiceService.checkOrder({ order: { order_number: "1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 5 }] } });
            assert.equal(result.references[0].productLots[0].expiryDate, "12/2027");
            assert.equal(result.requires_review, true);
        } finally { services.catalogRepository.loadAll = original; }
    });
    await t.test("Telegram lưu MySQL + outbox; Sheet lỗi không làm mất đơn", async () => {
        await services.orderService.postOrder("-1:1", "Đơn gốc");
        assert.equal(await models.Order.count(), 1);
        assert.equal(await models.OrderProjection.count(), 1);
        const worker = new OrderProjectionWorker({ models, orderSheetRepository: sheet, logger });
        fake.failNextWrite();
        await assert.rejects(worker.flush());
        assert.equal(await models.OrderProjection.count(), 1);
        await worker.flush();
        assert.equal(await models.OrderProjection.count(), 0);
        assert.ok((await models.Order.findOne({ where: { key: "-1:1" } })).projectedAt);
        assert.equal(fake.rows[1][2], "Đơn gốc");
    });
    await t.test("tạo đồng thời một key không sinh hai đơn; ACK outbox cũ không xóa revision mới", async () => {
        const results = await Promise.all([services.orderService.postOrder("-1:2", "Đơn"), services.orderService.postOrder("-1:2", "Đơn")]);
        assert.equal(results.filter(row => row.created).length, 1);
        let changed = false;
        const worker = new OrderProjectionWorker({ models, logger, orderSheetRepository: {
            async createIfAbsent() { if (!changed) { changed = true; await services.orderService.updateOrder("-1:2", "Đơn mới"); } }, async updateContent() {}
        } });
        await worker.flush();
        assert.equal((await models.OrderProjection.findByPk("-1:2")).revision, 2);
        await new OrderProjectionWorker({ models, orderSheetRepository: sheet, logger }).flush();
    });
    await t.test("sửa trên Sheet cập nhật DB; xóa dòng chuyển nguyên bản sang orders_ok", async () => {
        await sync.accept(event("orders", { key: "-1:1", content: "Đơn kế toán sửa", status: "OK", supplement: "Ghi chú", checked: true, ordersChecked: [{ code: "SP1" }] }));
        fake.rows.splice(1, 1);
        const result = await sync.accept(event("orderReconciliation", {}));
        assert.equal(result.archived, 1);
        assert.equal(await models.Order.count({ where: { key: "-1:1" } }), 0);
        const archived = await models.OrderOk.findOne({ where: { key: "-1:1" } });
        assert.equal(archived.content, "Đơn kế toán sửa");
        assert.equal(archived.status, "OK");
        assert.equal(archived.supplement, "Ghi chú");
        assert.deepEqual(archived.ordersChecked, [{ code: "SP1" }]);
        assert.equal((await services.orderService.postOrder("-1:1", "Telegram gửi lại")).reason, "ORDER_ARCHIVED");
    });
    await t.test("archive lỗi rollback, không xóa bản gốc; layout/key sai không archive", async () => {
        const order = await models.Order.findOne({ where: { key: "-1:2" } });
        const upsert = models.OrderOk.upsert;
        models.OrderOk.upsert = async () => { throw new Error("archive lỗi"); };
        try { await assert.rejects(services.orderRepository.archiveMissingOrders(new Set(), new Date(Date.now() + 1000)), /archive lỗi/); }
        finally { models.OrderOk.upsert = upsert; }
        assert.equal((await models.Order.findByPk(order.id)).key, "-1:2");
        const before = await models.OrderOk.count();
        fake.rows[1][0] = "không phải key";
        await assert.rejects(sync.accept(event("orderReconciliation", {}, 2)), /key/);
        assert.equal(await models.OrderOk.count(), before);
    });
    await t.test("webhook ký HMAC: chặn giả mạo/hết hạn/workbook lạ và ACK đúng sau commit", async () => {
        const app = createApp({ config, services, logger });
        const server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        const url = `http://127.0.0.1:${server.address().port}/integrations/sheets/events`;
        const envelope = (input, timestamp = Date.now()) => {
            const payload = JSON.stringify(input);
            return { payload, timestamp, signature: createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex") };
        };
        const send = body => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        try {
            const input = event("customers", { code: "KHHTTP", name: "HTTP" });
            assert.equal((await send({ ...envelope(input), signature: "0".repeat(64) })).status, 401);
            assert.equal((await send(envelope(input, Date.now() - 600000))).status, 401);
            assert.equal((await send(envelope({ ...input, spreadsheetId: "other" }))).status, 403);
            assert.equal((await send(envelope({ ...input, row: { code: "", name: "bad" } }))).status, 400);
            const response = await send(envelope(input));
            assert.equal(response.status, 200);
            assert.equal((await response.json()).eventId, input.eventId);
            assert.equal(services.catalogCache.getSnapshot().customer("KHHTTP").name, "HTTP");
        } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
    await t.test("adapter procedure dùng CALL JSON thật, không thay nghiệp vụ Node mặc định", async () => {
        await sequelize.query("DROP PROCEDURE IF EXISTS sp_test_business_contract");
        await sequelize.query(`CREATE PROCEDURE sp_test_business_contract(IN p_request JSON)
            SELECT JSON_OBJECT('contractVersion', '1.0',
                'requestId', JSON_UNQUOTE(JSON_EXTRACT(p_request, '$.requestId')),
                'operation', JSON_UNQUOTE(JSON_EXTRACT(p_request, '$.operation')),
                'success', JSON_EXTRACT('true', '$'),
                'data', JSON_OBJECT('created', JSON_EXTRACT('true', '$'),
                    'key', JSON_UNQUOTE(JSON_EXTRACT(p_request, '$.payload.key')))) AS response`);
        const root = createApplicationContainer({ config: loadConfig({ DATA_PROVIDER: "memory",
            BUSINESS_ROUTES: '{"orders.create":"procedure"}',
            BUSINESS_PROCEDURES: '{"orders.create":"sp_test_business_contract"}'
        }), overrides: { sequelize } });
        try {
            const count = await models.Order.count();
            assert.deepEqual(await root.cradle.orderService.postOrder("contract-test", "Dữ liệu test"),
                { created: true, key: "contract-test" });
            assert.equal(await models.Order.count(), count); // Procedure test chỉ kiểm tra giao thức.
        } finally {
            await root.dispose();
            await sequelize.query("DROP PROCEDURE sp_test_business_contract");
        }
    });
    await t.test("runtime dùng Connection/Model Factory tải cache trước khi listen và đóng pool khi dừng", async () => {
        const runtimeConfig = loadConfig({ DATA_PROVIDER: "mysql", PORT: "0", DB_HOST: "127.0.0.1", DB_PORT: String(port),
            DB_NAME: "checkdon_test", DB_USERNAME: "root", DB_PASSWORD: "local-test-only", DB_TLS: "false",
            SHEET_SYNC_SECRET: secret, CHECKDON_WORKBOOK_ID: "book" });
        const runtime = await startRuntime({ config: runtimeConfig, logger });
        try {
            const response = await fetch(`http://127.0.0.1:${runtime.server.address().port}/ready`);
            assert.equal(response.status, 200);
            assert.equal((await response.json()).ready, true);
            assert.ok(runtime.container.cradle.catalogCache.getSnapshot().customer("KHHTTP"));
        } finally { await runtime.stop(); }
    });
    await container.dispose();
});
