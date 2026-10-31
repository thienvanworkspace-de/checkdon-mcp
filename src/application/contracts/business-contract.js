import * as z from "zod/v4";

export const CONTRACT_VERSION = "1.0";
const decimal = z.string().max(64).regex(/^-?\d+(\.\d+)?$/);
const nullableDecimal = decimal.nullable().optional();
const text = z.string();
const optionalText = text.nullable().optional();
const orderLine = z.object({ product_code: text, qty: decimal, unit_price: nullableDecimal,
    discount_rate: nullableDecimal, promotion_policy: optionalText }).strict();
export const businessOrder = z.object({ order_number: text, customer_code: text, products: z.array(orderLine),
    discount_rate: nullableDecimal, promotion_policy: optionalText, isPromoted: z.boolean().nullable().optional() }).strict();
const invoiceLine = z.object({ product_code: text, qty: decimal, unit_price: decimal, amount: decimal, net_amount: decimal,
    line: z.number().int().nullable().optional(), lot_number: optionalText, expiry_date: optionalText,
    discount_rate: nullableDecimal, discount_amount: nullableDecimal }).strict();
const businessInvoice = z.object({ invoice_number: text, customer_code: text, products: z.array(invoiceLine),
    discount_rate: nullableDecimal, discount_amount: nullableDecimal, net_amount: decimal }).strict();

// DTO chỉ có JSON; không truyền Model, Date, Map, function hoặc đối tượng Decimal qua ranh giới.
const records = z.array(z.record(z.string(), z.json()));
export const catalogDto = z.object({ loadedAt: text, customers: records, products: records, accountants: records,
    customerFeatures: records, specificPrices: records, specificPromotions: records,
    programPromotions: records, productLots: records, hospitalPrices: records }).strict();
const checkResult = z.object({ message_code: z.literal("CHECK_RESULT"), errors: records, warnings: records,
    requires_review: z.boolean(), catalog_loaded_at: text, references: records,
    checks_performed: z.array(text), checks_not_performed: z.array(text) }).strict();

/** Một use case có một hợp đồng, độc lập nó chạy bằng Node, SQL hay Java/C#. */
export const operations = {
    "orders.create": {
        input: z.object({ key: text.min(1).max(191), content: text }).strict(),
        output: z.object({ created: z.boolean(), key: text, reason: text.optional() }).strict()
    },
    "orders.updateContent": {
        input: z.object({ key: text.min(1).max(191), content: text }).strict(),
        output: z.object({ updated: z.boolean(), key: text, reason: text.optional() }).strict()
    },
    "orders.check": { input: z.object({ order: businessOrder, catalog: catalogDto }).strict(), output: checkResult },
    "invoices.check": { input: z.object({ order: businessOrder, invoice: businessInvoice, catalog: catalogDto }).strict(), output: checkResult }
};
const requestFields = {
    contractVersion: z.literal(CONTRACT_VERSION), requestId: z.uuid(),
    context: z.object({ source: z.enum(["mcp", "telegram", "sheet", "internal"]), actorSubject: text.optional() }).strict()
};
export const businessRequestSchema = z.discriminatedUnion("operation", Object.entries(operations).map(([name, contract]) =>
    z.object({ ...requestFields, operation: z.literal(name), payload: contract.input }).strict()
));
export const businessResponseSchema = z.union([
    ...Object.entries(operations).map(([name, contract]) => z.object({
        contractVersion: z.literal(CONTRACT_VERSION), requestId: z.uuid(), operation: z.literal(name),
        success: z.literal(true), data: contract.output
    }).strict()),
    z.object({ contractVersion: z.literal(CONTRACT_VERSION), requestId: z.uuid(), operation: z.enum(Object.keys(operations)),
        success: z.literal(false), error: z.object({ code: text.min(1), message: text, retryable: z.boolean() }).strict() }).strict()
]);
export const successResponse = (request, data) => ({ contractVersion: CONTRACT_VERSION,
    requestId: request.requestId, operation: request.operation, success: true, data });
