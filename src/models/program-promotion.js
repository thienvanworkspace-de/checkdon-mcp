import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { code, text, active } from "./fields.js";

/** Chương trình theo thời hạn; lưu chính sách gốc và bậc đã chuẩn hóa nếu có. */
export class ProgramPromotion extends ApplicationModel {
    static table = "program_promotions";

    static fields() {
        return {
            // sourceKey ổn định khi sửa thời hạn/chính sách; productId null là chương trình chung.
            sourceKey: code(), promotionPolicy: text(), productId: { type: DataTypes.INTEGER, allowNull: true },
            fromDate: DataTypes.DATEONLY, toDate: DataTypes.DATEONLY,
            buy: DataTypes.INTEGER, present: DataTypes.INTEGER, isActive: active()
        };
    }
}
