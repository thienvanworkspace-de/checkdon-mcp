import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { text } from "./fields.js";

/** Thông tin kế toán; chưa thay thế danh sách email được phép trong OAuth. */
export class Accountant extends ApplicationModel {
    static table = "accountants";

    static fields() {
        return {
            name: text(), email: { type: DataTypes.STRING, allowNull: false, unique: true }, address: text()
        };
    }
}
