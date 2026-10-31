import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Envelope giữ nguyên JSON payload để ký HMAC, không phụ thuộc thứ tự key khi parser đọc body.
 * Timestamp chống phát lại lâu ngày; version trong transaction chống lặp/tráo thứ tự.
 */
export function registerSheetSyncRoute(app, { sheetSyncService, syncConfig, logger = console, clock = Date.now }) {
    app.post("/integrations/sheets/events", async (req, res) => {
        if (!sheetSyncService || !syncConfig.secret) return res.status(503).json({ error: "SYNC_NOT_CONFIGURED" });
        const { timestamp, payload, signature } = req.body ?? {};
        if (!Number.isSafeInteger(timestamp) || Math.abs(clock() - timestamp) > 300_000 ||
            typeof payload !== "string" || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) {
            return res.status(401).json({ error: "INVALID_SIGNATURE" });
        }
        const expected = createHmac("sha256", syncConfig.secret).update(`${timestamp}.${payload}`).digest();
        if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return res.status(401).json({ error: "INVALID_SIGNATURE" });
        try {
            const result = await sheetSyncService.accept(JSON.parse(payload));
            return res.json(result);
        } catch (error) {
            if (error.name === "ZodError" || error instanceof SyntaxError) return res.status(400).json({ error: "INVALID_EVENT" });
            const status = [403, 409].includes(error.status) ? error.status : 503;
            logger.warn("Sheet sync chưa hoàn tất.", { code: error.code ?? "SYNC_FAILED" });
            return res.status(status).json({ error: error.code ?? "SYNC_FAILED" });
        }
    });
}
