import { BusinessError } from "../contracts/business-error.js";

/** Một lớp/use case, không dồn nghiệp vụ vào switch trong một handler lớn. */
export class UseCaseFactory {
    constructor(factories) { this.factories = factories; }
    create(operation) {
        const factory = Object.hasOwn(this.factories, operation) ? this.factories[operation] : undefined;
        if (!factory) throw new BusinessError("UNKNOWN_OPERATION", "Chức năng nghiệp vụ chưa được đăng ký.");
        return factory();
    }
}
