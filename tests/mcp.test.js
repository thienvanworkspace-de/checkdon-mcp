import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { loadConfig, validatePostdonConfig } from "../src/config/index.js";
import { createApp } from "../src/http/app.js";
import { createMcpServices } from "../src/container.js";
import { startRuntime } from "../src/runtime.js";

const logger = { info() {}, warn() {}, error() {} };

test("cấu hình postdon được kiểm tra riêng; MCP không yêu cầu khóa Google/Telegram", async () => {
    const config = loadConfig({ PORT: "0" });
    assert.throws(() => validatePostdonConfig(config.postdon), /TELEGRAM_BOT_TOKEN/);
    await assert.rejects(startRuntime({ mcp: true, postdon: true, config, logger }), /Thiếu cấu hình/);
    const runtime = await startRuntime({ config, logger });
    try {
        const response = await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`);
        assert.equal(response.status, 200);
    } finally {
        await runtime.stop();
    }
});

test("MCP/OAuth hoạt động sau khi tách lớp — identity provider cục bộ, không gọi dịch vụ thật", async t => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "test", alg: "RS256" };
    let identity = { email: "test@example.invalid", email_verified: true };
    let identityFailure = false;
    const issuer = createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/oauth2/jwks") res.end(JSON.stringify({ keys: [jwk] }));
        else if (req.url === "/oauth2/userinfo") {
            res.statusCode = identityFailure ? 503 : 200;
            res.end(JSON.stringify(identity));
        } else { res.statusCode = 404; res.end("{}"); }
    });
    issuer.listen(0, "127.0.0.1");
    await once(issuer, "listening");
    const config = loadConfig({});
    config.authkitIssuer = `http://127.0.0.1:${issuer.address().port}`;
    config.allowedEmails = ["test@example.invalid"];
    // Tạo resource audience ổn định dù cổng HTTP được cấp động.
    config.mcpResourceUrl = "https://mcp.example.invalid/mcp";
    const app = createApp({ config, services: createMcpServices(), logger });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const resource = `${base}/mcp`;
    t.after(async () => {
        server.closeAllConnections();
        issuer.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => issuer.close(resolve))]);
    });
    const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(config.authkitIssuer).setAudience(config.mcpResourceUrl)
        .setSubject("local-user").setExpirationTime("5m").sign(privateKey);
    const headers = { Authorization: `Bearer ${token}` };

    await t.test("health và metadata", async () => {
        assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok", service: "checkdon-mcp" });
        const metadata = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
        assert.equal(metadata.resource, config.mcpResourceUrl);
        assert.deepEqual(metadata.authorization_servers, [config.authkitIssuer]);
    });
    await t.test("thiếu/sai token hoặc sai audience trả 401", async () => {
        const missing = await fetch(resource, { method: "POST" });
        assert.equal(missing.status, 401);
        assert.ok(missing.headers.get("www-authenticate").includes("resource_metadata="));
        assert.equal((await fetch(resource, { method: "POST", headers: { Authorization: "Bearer invalid" } })).status, 401);
        const wrongAudience = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test" })
            .setIssuer(config.authkitIssuer).setAudience("wrong").setSubject("local-user").setExpirationTime("5m").sign(privateKey);
        assert.equal((await fetch(resource, { method: "POST", headers: { Authorization: `Bearer ${wrongAudience}` } })).status, 401);
    });
    await t.test("email chưa xác minh/không được cho phép trả 403, UserInfo lỗi trả 502", async () => {
        identity.email_verified = false;
        assert.equal((await fetch(resource, { method: "POST", headers })).status, 403);
        identity = { email: "other@example.invalid", email_verified: true };
        assert.equal((await fetch(resource, { method: "POST", headers })).status, 403);
        identityFailure = true;
        assert.equal((await fetch(resource, { method: "POST", headers })).status, 502);
        identityFailure = false;
        identity = { email: "test@example.invalid", email_verified: true };
    });
    await t.test("handshake, listTools, hello và check_invoice demo", async () => {
        const client = new Client({ name: "test", version: "1.0.0" });
        try {
            await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers } }));
            assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ["check_invoice", "hello_checkdon"]);
            const hello = await client.callTool({ name: "hello_checkdon", arguments: { name: "Test" } });
            assert.ok(!hello.isError);
            assert.match(hello.content[0].text, /Xin chào Test!/);
            const invoice = await client.callTool({ name: "check_invoice", arguments: {
                order: { order_number: "DH1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 1 }] },
                invoice: { invoice_number: "HD1", customer_code: "KH1", products: [{ product_code: "SP1", qty: 1, unit_price: 100, amount: 100, net_amount: 100 }], net_amount: 100 }
            } });
            assert.ok(!invoice.isError);
            assert.equal(JSON.parse(invoice.content[0].text).message_code, "DEMO_ONLY");
            const invalid = await client.callTool({ name: "check_invoice", arguments: { order: {}, invoice: {} } });
            assert.equal(invalid.isError, true);
        } finally {
            await client.close();
        }
    });
});
