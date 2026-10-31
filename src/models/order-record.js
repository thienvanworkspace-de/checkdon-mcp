import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { text } from "./fields.js";

/** Định nghĩa chung để orders và orders_ok luôn có cấu trúc giống nhau. */
export class OrderRecord extends ApplicationModel {
    static fields() {
        return {
            key: { type: DataTypes.STRING(191), allowNull: false, unique: true },
            content: { type: DataTypes.TEXT, allowNull: false },
            receivedAt: { type: DataTypes.DATE, allowNull: false }, sheetDate: text(),
            status: text(), supplement: { type: DataTypes.TEXT, allowNull: true },
            // Checked/Orders_checked còn đang thiết kế: giữ JSON gốc, không ép về boolean.
            checked: { type: DataTypes.JSON, allowNull: true }, ordersChecked: { type: DataTypes.JSON, allowNull: true },
            sheetFields: { type: DataTypes.JSON, allowNull: true }, projectedAt: { type: DataTypes.DATE, allowNull: true },
            revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
        };
    }
}
