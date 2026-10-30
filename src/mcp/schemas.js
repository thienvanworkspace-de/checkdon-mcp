import * as z from "zod/v4";

// Schema giao tiếp MCP; không phụ thuộc nơi lưu dữ liệu.
const orderProductSchema = z.object({
    product_code: z.string(),
    qty: z.number(),
    unit_price: z.number().nullable().optional(),
    discount_rate: z.number().nullable().optional(),
    promotion_policy: z.string().nullable().optional()
});

export const orderSchema = z.object({
    order_number: z.string(),
    customer_code: z.string(),
    products: z.array(orderProductSchema),
    discount_rate: z.number().nullable().optional(),
    promotion_policy: z.string().nullable().optional(),
    isPromoted: z.boolean().nullable().optional()
});

const invoiceProductSchema = z.object({
    line: z.number().nullable().optional(),
    product_code: z.string(),
    lot_number: z.string().nullable().optional(),
    expiry_date: z.string().nullable().optional(),
    qty: z.number(),
    unit_price: z.number(),
    amount: z.number(),
    discount_rate: z.number().nullable().optional(),
    discount_amount: z.number().nullable().optional(),
    net_amount: z.number()
});

export const invoiceSchema = z.object({
    invoice_number: z.string(),
    customer_code: z.string(),
    products: z.array(invoiceProductSchema),
    discount_rate: z.number().nullable().optional(),
    discount_amount: z.number().nullable().optional(),
    net_amount: z.number()
});
