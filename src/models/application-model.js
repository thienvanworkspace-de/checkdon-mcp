import { Model, DataTypes } from "sequelize";

/**
 * Mỗi connection nhận một lớp con đã bind riêng. Không gọi init() trên lớp export,
 * tránh làm model của connection trước trỏ sang pool khác khi tạo DI container mới.
 */
export class ApplicationModel extends Model {
    static sourceMetadata = true;
    static configuration() { return {}; }

    static initialize(sequelize) {
        const ModelType = this;
        class BoundModel extends ModelType {}
        const fields = { ...this.fields() };
        if (this.sourceMetadata) fields.sourceData = { type: DataTypes.JSON, allowNull: true };
        BoundModel.init(fields, {
            sequelize, modelName: this.name, tableName: this.table,
            timestamps: true, charset: "utf8mb4", collate: "utf8mb4_bin",
            ...this.configuration()
        });
        return BoundModel;
    }
}
