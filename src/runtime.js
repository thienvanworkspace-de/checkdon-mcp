import { once } from "node:events";
import { loadConfig } from "./config/index.js";
import { createMcpServices, createPostdonServices } from "./container.js";
import { createApp } from "./http/app.js";

/** Khởi động transport được chọn. Cấu hình postdon được kiểm tra trước khi mở HTTP. */
export async function startRuntime({ mcp = true, postdon = false, config = loadConfig(), logger = console } = {}) {
    const controller = new AbortController();
    const worker = postdon ? await createPostdonServices(config.postdon, { logger }) : null;
    let server;
    if (mcp) {
        const app = createApp({ config, services: createMcpServices(), logger });
        server = app.listen(config.port, "0.0.0.0");
        await once(server, "listening");
        logger.info(`CheckDon MCP running on port ${server.address().port}`);
    }

    const polling = worker?.poller.run(controller.signal);
    let stopping;
    function stop() {
        stopping ??= (async () => {
            controller.abort();
            if (server) {
                const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
                server.closeAllConnections();
                await closed;
            }
            // Không thoát giữa một thao tác ghi Sheet đang thực hiện.
            await polling;
        })();
        return stopping;
    }
    return { server, stop, polling };
}

/** Lỗi khởi động/polling trả exit code khác 0 để supervisor phát hiện. */
export async function runMain(options) {
    let runtime;
    try {
        runtime = await startRuntime(options);
        const shutdown = () => {
            runtime.stop().catch(() => { process.exitCode = 1; });
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
        if (runtime.polling) await runtime.polling;
    } catch (error) {
        // Không in stack/URL từ SDK vì có thể chứa thông tin xác thực.
        console.error("Không chạy được CheckDon/Postdon. Kiểm tra cấu hình, cổng và quyền truy cập.");
        if (error.message?.startsWith("Thiếu cấu hình")) console.error(error.message);
        process.exitCode = 1;
        await runtime?.stop().catch(() => {});
    }
}
