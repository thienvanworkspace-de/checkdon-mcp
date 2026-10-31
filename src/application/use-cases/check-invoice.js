import { fromCatalogDto } from "../contracts/dto-mapper.js";

/** Use case kiểm tra hóa đơn: dùng một snapshot cho toàn bộ lần kiểm tra. */
export class CheckInvoice {
    constructor({ invoiceRules }) { this.rules = invoiceRules; }
    execute({ order, invoice, catalog }) { return this.rules.checkInvoice({ order, invoice }, fromCatalogDto(catalog)); }
}
