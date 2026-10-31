import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { code, text, money, active } from "./fields.js";

/** Sản phẩm và chính sách mặc định; không tự chọn thứ tự ưu tiên. */
export class Product extends ApplicationModel {
    static table = "products";

    static fields() {
        return {
            code: code(), name: { type: DataTypes.STRING, allowNull: false }, unit: text(),
            unitPrice: money(), promotionPolicy: text(), discountRate: money(), isActive: active()
        };
    }
}
