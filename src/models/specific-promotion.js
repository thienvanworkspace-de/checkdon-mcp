import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { foreign, active, pairIndex } from "./fields.js";

/** Bậc khuyến mãi riêng của một cặp khách–sản phẩm, có unique index cho cặp khóa. */
export class SpecificPromotion extends ApplicationModel {
    static table = "specific_promotions";

    static fields() {
        return {
            customerId: foreign(), productId: foreign(), buy: DataTypes.INTEGER, present: DataTypes.INTEGER, isActive: active()
        };
    }

    static configuration() { return { indexes: pairIndex() }; }
}
