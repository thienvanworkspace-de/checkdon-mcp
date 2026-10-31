import { toOrderDto, toInvoiceDto, toCatalogDto } from "../contracts/dto-mapper.js";

/** Orchestrator lấy snapshot RAM; các use case nhận DTO, không biết cache hay Sequelize. */
export class InvoiceApplicationService {
    constructor({ catalogCache, businessGateway, requestContext }) {
        this.cache = catalogCache;
        this.gateway = businessGateway;
        this.context = requestContext;
    }

    async execute(operation, order, invoice) {
        let snapshot;
        try { snapshot = this.cache.getSnapshot(); }
        catch { return { message_code: "CATALOG_NOT_READY", errors: [], requires_review: true }; }
        const payload = { order: toOrderDto(order), catalog: toCatalogDto(snapshot, order, invoice) };
        if (invoice) payload.invoice = toInvoiceDto(invoice);
        return this.gateway.execute(operation, payload, { source: "mcp", ...this.context.get() });
    }
    checkOrder({ order }) { return this.execute("orders.check", order); }
    checkInvoice({ order, invoice }) { return this.execute("invoices.check", order, invoice); }
}
