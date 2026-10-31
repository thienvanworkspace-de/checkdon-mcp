/** Lỗi kỹ thuật ổn định giữa các adapter; không chứa token, SQL, URL hoặc dữ liệu đơn. */
export class BusinessError extends Error {
    constructor(code, message, retryable = false) {
        super(message);
        this.name = "BusinessError";
        this.code = code;
        this.retryable = retryable;
    }
}
