import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";

/** Cursor đồng bộ và khóa logic; không có sourceData của Sheet. */
export class SyncCursor extends ApplicationModel {
    static table = "sync_cursors";
    static sourceMetadata = false;

    static fields() {
        return {
            scope: { type: DataTypes.STRING(191), primaryKey: true },
            version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
            payloadHash: { type: DataTypes.STRING(64), allowNull: true }
        };
    }
}
