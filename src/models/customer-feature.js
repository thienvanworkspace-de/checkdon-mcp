import { DataTypes } from "sequelize";
import { ApplicationModel } from "./application-model.js";
import { text, foreign } from "./fields.js";

/** Thông tin đặc thù khách hàng; một dòng cho mỗi customerId. */
export class CustomerFeature extends ApplicationModel {
    static table = "customer_features";

    static fields() {
        return {
            customerId: { ...foreign(), unique: true }, isPromoted: DataTypes.INTEGER,
            nameOnGoodsIssueInvoice: text(), addressOnGoodsIssueInvoice: text()
        };
    }
}
