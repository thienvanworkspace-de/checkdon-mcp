/** HTTP client cho Telegram Bot API; dùng fetch của Node thay cho SDK bot. */
export class TelegramClient {
    constructor({ token, fetchImpl = fetch }) {
        this.token = token;
        this.fetchImpl = fetchImpl;
    }

    async getUpdates({ offset, signal }) {
        // Token chỉ có trong request; tuyệt đối không đưa URL vào log hoặc lỗi.
        let response;
        try {
            response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/getUpdates`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offset, timeout: 30, allowed_updates: ["message", "edited_message"] }),
                signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)])
            });
        } catch {
            throw new Error("Không kết nối được Telegram Bot API.");
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error("Telegram trả dữ liệu không hợp lệ.");
        }
        if (!response.ok || !data.ok || !Array.isArray(data.result)) {
            const error = new Error("Telegram từ chối getUpdates; kiểm tra token/webhook/polling instance.");
            error.status = data.error_code ?? response.status;
            error.retryAfter = data.parameters?.retry_after;
            throw error;
        }
        return data.result;
    }
}
