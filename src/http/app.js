import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createCheckdonHandler } from "../mcp/handler.js";
import { createOAuthMiddleware } from "./oauth-middleware.js";

/** Tạo ứng dụng nhưng chưa listen, giúp kiểm thử HTTP độc lập với process chính. */
export function createApp({ config, services, logger = console }) {
    const app = config.allowedHosts?.length
        ? createMcpExpressApp({ host: "0.0.0.0", allowedHosts: config.allowedHosts })
        : createMcpExpressApp();

    app.get("/.well-known/oauth-protected-resource", (req, res) => {
        res.json({
            resource: config.mcpResourceUrl,
            authorization_servers: [config.authkitIssuer],
            bearer_methods_supported: ["header"]
        });
    });
    app.get("/health", (req, res) => res.json({ status: "ok", service: "checkdon-mcp" }));

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
