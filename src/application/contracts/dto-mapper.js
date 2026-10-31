import Decimal from "decimal.js";
import { catalogDto } from "./business-contract.js";

/** Không làm tròn ngầm; Java BigDecimal/C# decimal/MySQL DECIMAL nhận chuỗi thập phân. */
function mapNumbers(record, fields) {
    const copy = structuredClone(record);
    for (const field of fields) {
        if (copy[field] == null) continue;
        // Giữ scale của chuỗi DECIMAL từ MySQL; số JS/exponent được chuyển sang decimal text.
        if (typeof copy[field] === "string" && /^-?\d+(\.\d+)?$/.test(copy[field])) continue;
        copy[field] = new Decimal(copy[field]).toFixed();
    }
    return copy;
}
export function toOrderDto(order) {
    return { ...mapNumbers(order, ["discount_rate"]), products: order.products.map(line =>
        mapNumbers(line, ["qty", "unit_price", "discount_rate"])) };
}
export function toInvoiceDto(invoice) {
    return { ...mapNumbers(invoice, ["discount_rate", "discount_amount", "net_amount"]),
        products: invoice.products.map(line => mapNumbers(line, ["qty", "unit_price", "amount", "net_amount", "discount_rate", "discount_amount"])) };
}

/** Chỉ gửi phần danh mục liên quan đến request, không gửi toàn bộ cache cho service ngoài. */
export function toCatalogDto(snapshot, order, invoice) {
    const codes = new Set([...order.products, ...(invoice?.products ?? [])].map(line => line.product_code));
    const customers = snapshot.customers.filter(row => row.code === order.customer_code);
    const products = snapshot.products.filter(row => codes.has(row.code));
    const customerIds = new Set(customers.map(row => row.id));
    const productIds = new Set(products.map(row => row.id));
    const clean = rows => rows.map(({ sourceData, createdAt, updatedAt, ...row }) =>
        mapNumbers(row, ["unitPrice", "discountRate", "soldQuantity"]));
    return catalogDto.parse({
        loadedAt: snapshot.loadedAt, customers: clean(customers), products: clean(products), accountants: [],
        customerFeatures: clean(snapshot.customerFeatures.filter(row => customerIds.has(row.customerId))),
        specificPrices: clean(snapshot.specificPrices.filter(row => customerIds.has(row.customerId) && productIds.has(row.productId))),
        specificPromotions: clean(snapshot.specificPromotions.filter(row => customerIds.has(row.customerId) && productIds.has(row.productId))),
        hospitalPrices: clean(snapshot.hospitalPrices.filter(row => customerIds.has(row.customerId) && productIds.has(row.productId))),
        programPromotions: clean(snapshot.programPromotions.filter(row => row.productId == null || productIds.has(row.productId))),
        productLots: clean(snapshot.productLots.filter(row => productIds.has(row.productId)))
    });
}

/** Tạo lookup local từ DTO; function này không bao giờ nằm trong JSON request. */
export function fromCatalogDto(catalog) {
    const customers = new Map(catalog.customers.map(row => [row.code, row]));
    const products = new Map(catalog.products.map(row => [row.code, row]));
    return { ...catalog, customer: code => customers.get(code), product: code => products.get(code) };
}
