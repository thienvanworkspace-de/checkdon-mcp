import { registerSheetSyncRoute } from "./sync/sheet-sync-route.js";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createCheckdonHandler } from "../mcp/handler.js";
import { createOAuthMiddleware } from "./oauth-middleware.js";

/** Tạo ứng dụng nhưng chưa listen, giúp kiểm thử HTTP độc lập với process chính. */
export function createApp({ config, services, logger = console }) {
    const app = config.allowedHosts?.length
        ? createMcpExpressApp({ host: "0.0.0.0", allowedHosts: config.allowedHosts, jsonLimit: "256kb" })
        : createMcpExpressApp({ jsonLimit: "256kb" });

    app.get("/.well-known/oauth-protected-resource", (req, res) => {
        res.json({
            resource: config.mcpResourceUrl,
            authorization_servers: [config.authkitIssuer],
            bearer_methods_supported: ["header"]
        });
    });
    app.get("/health", (req, res) => res.json({ status: "ok", service: "checkdon-mcp" }));

    app.get("/ready", (req, res) => {
        try { const snapshot = services.catalogCache.getSnapshot(); res.json({ ready: true, loadedAt: snapshot.loadedAt }); }
        catch { res.status(503).json({ ready: false }); }
    });
    registerSheetSyncRoute(app, {
        sheetSyncService: config.dataProvider === "mysql" ? services.sheetSyncService : null,
        syncConfig: config.sync, logger
    });

    const handler = toNodeHandler(createCheckdonHandler(services));
    app.all("/mcp", createOAuthMiddleware({ config, logger }), async (req, res) => {
        try {
            await handler(req, res, req.body);
        } catch {
            logger.error("MCP không xử lý được request.");
            if (!res.headersSent) res.status(500).json({ error: "internal_error", message: "MCP server gặp lỗi nội bộ." });
        }
    });
    return app;
}
