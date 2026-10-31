import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { loadConfig } from "../src/config/index.js";
import { createApplicationContainer, emptyCatalog } from "../src/container.js";
import { CatalogCache } from "../src/cache/catalog-cache.js";
import { businessRequestSchema } from "../src/application/contracts/business-contract.js";
import { HttpBusinessExecutor } from "../src/infrastructure/business/http-business-executor.js";

const order = { order_number: "DH1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 3, unit_price: 0.1 }] };
async function cacheFixture() {
    const cache = new CatalogCache({ catalogRepository: { loadAll: async () => ({
        ...emptyCatalog(), customers: [{ id: 1, code: "KH1", isActive: 1 }, { id: 2, code: "OTHER" }],
        products: [{ id: 1, code: "SP1", unitPrice: "0.10", isActive: 1 }, { id: 2, code: "SP2", unitPrice: "999" }]
    }) } });
    await cache.refresh();
    return cache;
}
function container(cache, env = {}, overrides = {}) {
    return createApplicationContainer({ config: loadConfig({ DATA_PROVIDER: "memory", ...env }),
        overrides: { catalogCache: cache, ...overrides } });
}

test("mặc định tất cả use case là Node, giữ kết quả cũ và không mở SQL/HTTP adapter", async () => {
    const cache = await cacheFixture();
    const root = container(cache, {}, {
        procedureBusinessExecutor: { execute() { throw new Error("không được gọi SQL"); } },
        httpBusinessExecutor: { execute() { throw new Error("không được gọi HTTP"); } }
    });
    const result = await root.cradle.invoiceService.checkOrder({ order });
    assert.equal(result.message_code, "CHECK_RESULT");
    assert.deepEqual(result.errors, []);
    assert.equal(root.cradle.businessConfig.routes["orders.check"], undefined);
    await root.dispose();
});

test("chuyển một use case sang HTTP vẫn giữ DTO/kết quả; chỉ gửi danh mục liên quan", async () => {
    const cache = await cacheFixture();
    const peer = container(cache);
    let captured;
    const server = createServer(async (req, res) => {
        assert.equal(req.url, "/v1/business/execute");
        assert.equal(req.headers.authorization, "Bearer internal-test-only");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        captured = businessRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
        const response = await peer.cradle.nodeBusinessExecutor.execute(captured);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(response));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const root = container(cache, {
        BUSINESS_ROUTES: JSON.stringify({ "orders.check": "http" }),
        BUSINESS_SERVICE_URL: `http://127.0.0.1:${server.address().port}/v1/business/execute`,
        BUSINESS_SERVICE_TOKEN: "internal-test-only"
    });
    try {
        const expected = await peer.cradle.invoiceService.checkOrder({ order });
        const actual = await root.cradle.requestContext.run({ source: "mcp", actorSubject: "verified-user" },
            () => root.cradle.invoiceService.checkOrder({ order }));
        assert.deepEqual(actual, expected);
        assert.equal(captured.payload.order.products[0].unit_price, "0.1");
        assert.equal(captured.payload.order.products[0].qty, "3");
        assert.equal(captured.context.actorSubject, "verified-user");
        assert.deepEqual(captured.payload.catalog.products.map(row => row.code), ["SP1"]);
        assert.deepEqual(captured.payload.catalog.customers.map(row => row.code), ["KH1"]);
        assert.ok(!("sourceData" in captured.payload.catalog.products[0]));
    } finally {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        await root.dispose(); await peer.dispose();
    }
});

test("SP được chọn riêng theo operation, query có allowlist và tham số JSON", async () => {
    let sql, options, request;
    const root = container(await cacheFixture(), {
        BUSINESS_ROUTES: JSON.stringify({ "orders.create": "procedure" }),
        BUSINESS_PROCEDURES: JSON.stringify({ "orders.create": "sp_create_order" })
    }, { sequelize: { async query(query, config) {
        sql = query; options = config; request = JSON.parse(config.replacements.request);
        return [{ response: JSON.stringify({ contractVersion: "1.0", operation: request.operation, requestId: request.requestId,
            success: true, data: { created: true, key: request.payload.key } }) }];
    } } });
    try {
        const content = "'; DROP TABLE orders; --";
        assert.deepEqual(await root.cradle.orderService.postOrder("-1:1", content), { created: true, key: "-1:1" });
        assert.equal(sql, "CALL `sp_create_order`(:request)");
        assert.ok(!sql.includes(content));
        assert.equal(request.payload.content, content);
        assert.equal(options.logging, false);
        assert.equal(request.context.source, "telegram");
    } finally { await root.dispose(); }
    assert.throws(() => loadConfig({ BUSINESS_PROCEDURES: '{"orders.create":"sp_bad; DROP"}' }));
    assert.throws(() => loadConfig({ BUSINESS_ROUTES: '{"unknown":"http"}' }));
});

test("response sai requestId/version/schema bị chặn; không tự fallback sang local", async () => {
    const peer = container(await cacheFixture());
    const baseline = await peer.cradle.invoiceService.checkOrder({ order });
    await peer.dispose();
    for (const mutate of [value => ({ ...value, requestId: "00000000-0000-4000-8000-000000000000" }),
        value => ({ ...value, contractVersion: "2.0" }), value => ({ ...value, data: {} })]) {
        const root = container(await cacheFixture(), { BUSINESS_ROUTES: '{"orders.check":"http"}' }, {
            httpBusinessExecutor: { async execute(request) {
                return mutate({ contractVersion: "1.0", requestId: request.requestId, operation: request.operation,
                    success: true, data: baseline });
            } }
        });
        await assert.rejects(root.cradle.invoiceService.checkOrder({ order }), { code: "INVALID_BUSINESS_RESPONSE" });
        await root.dispose();
    }
});

test("remote lỗi không lộ URL/token/response body và không tự retry lệnh ghi", async () => {
    let calls = 0;
    const remote = new HttpBusinessExecutor({ businessConfig: { remote: {
        url: "https://business.example.invalid/v1/business/execute", token: "secret-test", timeoutMs: 1000
    } }, fetchImpl: async () => { calls++; throw new Error("secret-test upstream stack"); } });
    await assert.rejects(remote.execute({}), error => error.code === "BUSINESS_SERVICE_UNAVAILABLE" && !error.message.includes("secret-test"));
    assert.equal(calls, 1);
});
