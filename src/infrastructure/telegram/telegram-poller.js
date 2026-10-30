import { setTimeout as delay } from "node:timers/promises";

/** Xử lý tuần tự và chỉ xác nhận update sau khi business hoàn tất ghi dữ liệu. */
export class TelegramPoller {
    constructor({ client, handler, logger = console, wait = delay }) {
        this.client = client;
        this.handler = handler;
        this.logger = logger;
        this.wait = wait;
        this.offset = 0;
    }

    async run(signal) {
        this.logger.info("Service postdon đang nhận Telegram updates.");
        while (!signal.aborted) {
            try {
                const updates = await this.client.getUpdates({ offset: this.offset, signal });
                for (const update of updates) {
                    if (signal.aborted) break;
                    await this.handler.handle(update);
                    this.offset = update.update_id + 1;
                }
            } catch (error) {
                if (signal.aborted) break;
                // Sai token hoặc một worker/webhook khác đang chạy: dừng để sửa cấu hình.
                if ([401, 403, 409].includes(error.status)) throw error;
                this.logger.warn("Postdon chưa xử lý xong update; sẽ thử lại.", {
                    offset: this.offset,
                    code: error.code ?? "UPDATE_FAILED"
                });
                const seconds = Math.min(300, Math.max(1, Number(error.retryAfter) || 5));
                await this.wait(seconds * 1000, undefined, { signal }).catch(error => {
                    if (!signal.aborted) throw error;
                });
            }
        }
    }
}
