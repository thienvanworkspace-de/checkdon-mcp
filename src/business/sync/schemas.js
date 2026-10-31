import * as z from "zod/v4";

const code = z.string().trim().min(1).max(100);
const optionalText = z.string().max(255).nullable().optional();
const integer = z.number().int().safe();
const active = z.union([z.literal(0), z.literal(1)]).optional();
// Giữ DECIMAL ở dạng chuỗi, không đi qua phép tính số thực nhị phân.
const money = z.union([z.string().regex(/^\d{1,13}(\.\d{1,2})?$/), z.number().nonnegative().finite()])
    .transform(String).pipe(z.string().regex(/^\d{1,13}(\.\d{1,2})?$/)).nullable().optional();
const rate = money.refine(value => value == null || Number(value) <= 100, "Chiết khấu phải từ 0 đến 100.");
const date = z.iso.date().nullable().optional();
const featureSchema = z.object({
    isPromoted: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
    nameOnGoodsIssueInvoice: optionalText, addressOnGoodsIssueInvoice: optionalText
}).strict();
const basePromotion = { buy: integer.positive(), present: integer.nonnegative(), isActive: active };

const baseEntitySchemas = {
    customers: z.object({ code, name: z.string().trim().min(1).max(255), address: optionalText,
        province: optionalText, category: integer.nullable().optional(), hasFeatures: integer.nullable().optional(), features: featureSchema.optional(), isActive: active }).strict(),
    products: z.object({ code, name: z.string().trim().min(1).max(255), unit: optionalText,
        unitPrice: money, discountRate: rate, promotionPolicy: optionalText, isActive: active }).strict(),
    accountants: z.object({ email: z.email(), name: optionalText, address: optionalText }).strict(),
    customerFeatures: z.object({ customerCode: code, isPromoted: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
        nameOnGoodsIssueInvoice: optionalText, addressOnGoodsIssueInvoice: optionalText }).strict(),
    specificPrices: z.object({ customerCode: code, productCode: code, unitPrice: money, discountRate: rate, promotionPolicy: optionalText, isActive: active }).strict(),
    specificPromotions: z.object({ customerCode: code, productCode: code, ...basePromotion }).strict(),
    productLots: z.object({ productCode: code, lotNumber: z.string().trim().min(1).max(100),
        expiryDate: z.string().trim().min(1).max(50), isActive: active }).strict(),
    hospitalPrices: z.object({ customerCode: code, productCode: code, unitPrice: money, discountRate: rate,
        soldQuantity: z.union([z.number().nonnegative().finite(), z.string().regex(/^\d{1,12}(\.\d{1,3})?$/)])
            .transform(String).nullable().optional(), isActive: active }).strict(),
    programPromotions: z.object({ sourceKey: code, productCode: code.nullable().optional(),
        promotionPolicy: optionalText, fromDate: date, toDate: date,
        buy: integer.positive().nullable().optional(), present: integer.nonnegative().nullable().optional(), isActive: active }).strict().refine(
        row => !row.fromDate || !row.toDate || row.fromDate <= row.toDate, "Khoảng ngày không hợp lệ."
    )
};

baseEntitySchemas.orders = z.object({
    key: z.string().trim().min(1).max(191), content: z.string().min(1), status: optionalText,
    sheetDate: optionalText, supplement: z.string().nullable().optional(),
    checked: z.json().optional(), ordersChecked: z.json().optional(),
    receivedAt: z.iso.datetime({ offset: true }).optional()
}).strict();
baseEntitySchemas.orderReconciliation = z.object({}).strict();
export const entitySchemas = Object.fromEntries(Object.entries(baseEntitySchemas).map(([entity, schema]) => [
    entity, schema.safeExtend({ sourceData: z.record(z.string(), z.json()).optional() })
]));

export function parseSyncEvent(input) {
    const event = z.object({
        eventId: z.string().min(1).max(100), spreadsheetId: z.string().min(1).max(150),
        entity: z.enum(Object.keys(entitySchemas)), version: integer.positive(), row: z.unknown()
    }).strict().parse(input);
    event.row = entitySchemas[event.entity].parse(event.row);
    return event;
}

export function recordKey(entity, row) {
    if (entity === "orders") return row.key;
    if (entity === "accountants") return row.email;
    if (entity === "customerFeatures") return row.customerCode;
    if (["specificPrices", "specificPromotions", "hospitalPrices"].includes(entity)) return JSON.stringify([row.customerCode, row.productCode]);
    if (entity === "productLots") return JSON.stringify([row.productCode, row.lotNumber]);
    return row.code ?? row.sourceKey;
}
