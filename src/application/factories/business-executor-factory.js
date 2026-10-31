import { BusinessError } from "../contracts/business-error.js";

/** Lazy Factory: không mở pool MySQL/HTTP khi chức năng đang chạy local. */
export class BusinessExecutorFactory {
    constructor(factories) { this.factories = factories; }
    create(backend) {
        const factory = Object.hasOwn(this.factories, backend) ? this.factories[backend] : undefined;
        if (!factory) throw new BusinessError("UNKNOWN_BUSINESS_BACKEND", "Backend nghiệp vụ chưa được đăng ký.");
        return factory();
    }
}
