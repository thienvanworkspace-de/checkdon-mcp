import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { code, text, active } from "./fields.js";

/** Khách hàng: dữ liệu chuẩn theo model learn_sqlize. */
export class Customer extends ApplicationModel {
    static table = "customers";

    static fields() {
        return {
            code: code(), name: { type: DataTypes.STRING, allowNull: false },
            address: text(), province: text(), category: DataTypes.INTEGER,
            // Giữ trường đặc tính của model gốc; chưa tự suy diễn ý nghĩa từng bit.
            hasFeatures: DataTypes.INTEGER, isActive: active()
        };
    }
}
