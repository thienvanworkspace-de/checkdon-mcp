import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { foreign, active } from "./fields.js";

/** Lô sản phẩm và hạn dùng nguồn; không tự đổi tháng/năm thành một ngày giả định. */
export class ProductLot extends ApplicationModel {
    static table = "product_lots";

    static fields() {
        return {
            productId: foreign(), lotNumber: { type: DataTypes.STRING(100), allowNull: false },
            // Giữ nguyên độ chính xác ngày/tháng từ Sheet, không tự đoán ngày cuối tháng.
            expiryDate: { type: DataTypes.STRING(50), allowNull: false }, isActive: active()
        };
    }

    static configuration() { return { indexes: [{ unique: true, fields: ["productId", "lotNumber"] }] }; }
}
