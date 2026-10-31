import { once } from "node:events";
import { loadConfig, validatePostdonConfig } from "./config/index.js";
import { createApplicationContainer, registerPostdon } from "./container.js";
import { createApp } from "./http/app.js";

/** Khởi tạo MySQL và cache xong mới mở HTTP/polling. Không sync schema/migration tự động. */
export async function startRuntime({ mcp = true, postdon = false, config = loadConfig(), logger = console, containerFactory = createApplicationContainer } = {}) {
    const controller = new AbortController();
    const container = containerFactory({ config, logger });
    let server;
    const tasks = [];
    try {
        if (postdon) validatePostdonConfig(config.postdon);
        if (config.dataProvider === "mysql") {
            if (!config.sync.spreadsheetId || !config.sync.secret || config.sync.secret.length < 32) {
                throw new Error("Thiếu cấu hình sync: CHECKDON_WORKBOOK_ID và SHEET_SYNC_SECRET (ít nhất 32 ký tự).");
            }
            await container.cradle.sequelize.authenticate();
        }
        await container.cradle.catalogCache.refresh();
        if (postdon) await registerPostdon(container);
        if (mcp) {
            const app = createApp({ config, services: container.cradle, logger });
            server = app.listen(config.port, "0.0.0.0");
            await once(server, "listening");
            logger.info(`CheckDon MCP running on port ${server.address().port}`);
        }
        if (postdon) {
            tasks.push(container.cradle.poller.run(controller.signal));
            tasks.push(container.cradle.projectionWorker.run(controller.signal));
        }
    } catch (error) {
        controller.abort();
        await container.dispose();
        throw error;
    }
    const polling = tasks.length ? Promise.all(tasks) : undefined;
    let stopping;
    function stop() {
        stopping ??= (async () => {
            controller.abort();
            if (server) {
                const closed = new Promise(resolve => server.close(resolve));
                server.closeAllConnections();
                await closed;
            }
            await Promise.allSettled(tasks);
            await container.dispose();
        })();
        return stopping;
    }
    return { server, stop, polling, container };
}

export async function runMain(options) {
    let runtime;
    try {
        runtime = await startRuntime(options);
        const shutdown = () => runtime.stop().catch(() => { process.exitCode = 1; });
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
        if (runtime.polling) await runtime.polling;
    } catch (error) {
        console.error("Không chạy được CheckDon/Postdon. Kiểm tra cấu hình MySQL, sync và quyền truy cập.");
        if (error.message?.startsWith("Thiếu cấu hình")) console.error(error.message);
        process.exitCode = 1;
        await runtime?.stop().catch(() => {});
    }
}
