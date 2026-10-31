import { ApplicationModel } from "./application-model.js";
import { text, money, foreign, active, pairIndex } from "./fields.js";

/** Giá/chiết khấu riêng theo cặp khách–sản phẩm; thứ tự ưu tiên vẫn chờ chốt. */
export class SpecificPrice extends ApplicationModel {
    static table = "specific_prices";

    static fields() {
        return {
            customerId: foreign(), productId: foreign(), unitPrice: money(), discountRate: money(), promotionPolicy: text(), isActive: active()
        };
    }

    static configuration() { return { indexes: pairIndex() }; }
}
