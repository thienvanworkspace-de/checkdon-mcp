import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { money, foreign, active, pairIndex } from "./fields.js";

/** Giá bệnh viện và số đã bán từ nguồn; chưa suy ra hạn mức hay thứ tự ưu tiên. */
export class HospitalPrice extends ApplicationModel {
    static table = "hospital_prices";

    static fields() {
        return {
            customerId: foreign(), productId: foreign(), unitPrice: money(), discountRate: money(),
            soldQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: true }, isActive: active()
        };
    }

    static configuration() { return { indexes: pairIndex() }; }
}
