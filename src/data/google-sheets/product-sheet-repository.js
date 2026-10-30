import { ProductRepository } from "../contracts/product-repository.js";
import { quoteSheetName } from "../../infrastructure/google-sheets/google-sheets-gateway.js";

export class ProductSheetRepository extends ProductRepository {
    constructor({ gateway, workbookId, sheetName = "Sản Phẩm" }) {
        super();
        this.gateway = gateway;
        this.workbookId = workbookId;
        this.range = `${quoteSheetName(sheetName)}!A:F`;
    }

    // Giữ dữ liệu thô (gồm tiêu đề) như postdon; chưa đoán ý nghĩa 6 cột.
    getProducts() {
        return this.gateway.read(this.workbookId, this.range);
    }
}
