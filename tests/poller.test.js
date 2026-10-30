import test from "node:test";
import assert from "node:assert/strict";
import { TelegramClient } from "../src/infrastructure/telegram/telegram-client.js";
import { TelegramPoller } from "../src/infrastructure/telegram/telegram-poller.js";
const logger = { info() {}, warn() {} };

test("không xác nhận update lỗi; thử lại từ update chưa ghi xong", async () => {
    const controller = new AbortController();
    const offsets = [];
    const attempts = [];
    let failed = false;
    const client = { async getUpdates({ offset }) {
        offsets.push(offset);
        return offset === 0 ? [{ update_id: 10 }, { update_id: 11 }] : [{ update_id: 11 }];
    } };
    const handler = { async handle(update) {
        attempts.push(update.update_id);
        if (update.update_id === 11 && !failed) { failed = true; throw new Error("Sheet lỗi"); }
        if (update.update_id === 11) controller.abort();
    } };
    const poller = new TelegramPoller({ client, handler, logger, wait: async () => {} });
    await poller.run(controller.signal);
    assert.deepEqual(offsets, [0, 11]);
    assert.deepEqual(attempts, [10, 11, 11]);
    assert.equal(poller.offset, 12);
});

test("polling tôn trọng retry_after, dừng khi hủy hoặc khi token/webhook lỗi", async () => {
    const controller = new AbortController();
    let waited;
    const poller = new TelegramPoller({
        client: { async getUpdates() { throw Object.assign(new Error("rate limit"), { status: 429, retryAfter: 12 }); } },
        handler: {}, logger,
        wait: async milliseconds => { waited = milliseconds; controller.abort(); }
    });
    await poller.run(controller.signal);
    assert.equal(waited, 12000);
    for (const status of [401, 403, 409]) {
        const fatal = new TelegramPoller({
            client: { async getUpdates() { throw Object.assign(new Error("fatal"), { status }); } }, handler: {}, logger
        });
        await assert.rejects(fatal.run(new AbortController().signal), { status });
    }
});

test("Telegram client chỉ đăng ký message/edited_message, đặt timeout, không lộ token qua lỗi", async () => {
    let captured;
    const client = new TelegramClient({ token: "fake-secret", fetchImpl: async (url, init) => {
        captured = { url, init };
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
    } });
    await client.getUpdates({ offset: 15, signal: new AbortController().signal });
    assert.deepEqual(JSON.parse(captured.init.body), { offset: 15, timeout: 30, allowed_updates: ["message", "edited_message"] });
    assert.ok(captured.init.signal);
    const broken = new TelegramClient({ token: "fake-secret", fetchImpl: async () => { throw new Error("https://api.telegram.org/botfake-secret"); } });
    await assert.rejects(broken.getUpdates({ offset: 0, signal: new AbortController().signal }), error => !error.message.includes("fake-secret"));
});
