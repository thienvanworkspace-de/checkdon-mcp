import { BusinessExecutor } from "../../application/ports/business-executor.js";
import { BusinessError } from "../../application/contracts/business-error.js";

/** Adapter tương lai cho Java/C#: bật theo từng operation, không tự retry lệnh ghi. */
export class HttpBusinessExecutor extends BusinessExecutor {
    constructor({ businessConfig, fetchImpl = fetch }) {
        super(); this.config = businessConfig.remote; this.fetch = fetchImpl;
    }

    async execute(request) {
        let url;
        try { url = new URL(this.config.url); }
        catch { throw new BusinessError("BUSINESS_SERVICE_NOT_CONFIGURED", "Chưa cấu hình service nghiệp vụ."); }
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (url.username || url.password || url.search || url.hash ||
            (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
            (!loopback && !this.config.token)) {
            throw new BusinessError("INVALID_BUSINESS_SERVICE_CONFIG", "Service cần HTTPS và xác thực nội bộ.");
        }
        const timeout = this.config.timeoutMs;
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) {
            throw new BusinessError("INVALID_BUSINESS_SERVICE_CONFIG", "Timeout service phải từ 1 đến 60000 ms.");
        }
        let response;
        try {
            response = await this.fetch(url, {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
                headers: { "Content-Type": "application/json", ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}) },
                body: JSON.stringify(request)
            });
        } catch {
            throw new BusinessError("BUSINESS_SERVICE_UNAVAILABLE", "Không gọi được service nghiệp vụ.", true);
        }
        if (!response.ok) throw new BusinessError("BUSINESS_SERVICE_HTTP_ERROR", "Service nghiệp vụ trả HTTP lỗi.", response.status >= 500);
        try { return await response.json(); }
        catch { throw new BusinessError("INVALID_BUSINESS_RESPONSE", "Service trả JSON không hợp lệ."); }
    }
}
