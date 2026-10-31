import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";

/** Transactional outbox, cùng transaction với thay đổi đơn. */
export class OrderProjection extends ApplicationModel {
    static table = "order_projections";
    static sourceMetadata = false;

    static fields() {
        return {
            orderKey: { type: DataTypes.STRING(191), primaryKey: true },
            revision: { type: DataTypes.INTEGER, allowNull: false },
            payload: { type: DataTypes.JSON, allowNull: false }
        };
    }
}
