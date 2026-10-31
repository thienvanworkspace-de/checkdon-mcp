import { fromCatalogDto } from "../contracts/dto-mapper.js";

/** Use case kiểm tra đơn: biến DTO tham chiếu thành lookup rồi gọi luật Node hiện tại. */
export class CheckOrder {
    constructor({ invoiceRules }) { this.rules = invoiceRules; }
    execute({ order, catalog }) { return this.rules.checkOrder({ order }, fromCatalogDto(catalog)); }
}
