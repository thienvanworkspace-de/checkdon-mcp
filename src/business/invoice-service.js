import DecimalJs from "decimal.js";

// Đủ độ chính xác cho các decimal DTO tối đa 64 ký tự; không đổi cấu hình Decimal toàn cục.
const Decimal = DecimalJs.clone({ precision: 160 });

/** Luật nghiệp vụ thuần: nhận snapshot từ use case, không biết cache/transport/Sequelize. */
export class InvoiceService {
    async checkOrder({ order }, snapshot) {
        const data = snapshot;
        const errors = [];
        const warnings = [];
        const references = [];
        const customer = data.customer(order.customer_code);
        if (!customer || customer.isActive === 0) errors.push({ error_code: "CUSTOMER_NOT_FOUND_OR_INACTIVE" });
        const feature = customer && data.customerFeatures.find(row => row.customerId === customer.id);
        if (!order.products.length) errors.push({ error_code: "EMPTY_ORDER" });
        for (const [index, line] of order.products.entries()) {
            const product = data.product(line.product_code);
            const fail = (code, details = {}) => errors.push({ error_code: code, line: index + 1, product_code: line.product_code, ...details });
            if (!product || product.isActive === 0) { fail("PRODUCT_NOT_FOUND_OR_INACTIVE"); continue; }
            if (!Number.isFinite(Number(line.qty)) || line.qty <= 0) fail("INVALID_QUANTITY");
            const specificPrices = data.specificPrices.filter(row => row.customerId === customer?.id && row.productId === product.id && row.isActive !== 0);
            const specificPromotions = data.specificPromotions.filter(row => row.customerId === customer?.id && row.productId === product.id && row.isActive !== 0);
            const programPromotions = data.programPromotions.filter(row => (row.productId == null || row.productId === product.id) && row.isActive !== 0);
            const hospitalPrices = data.hospitalPrices.filter(row => row.customerId === customer?.id && row.productId === product.id && row.isActive !== 0);
            references.push({ product_code: product.code, productPrice: product.unitPrice, productDiscountRate: product.discountRate,
                promotionPolicy: product.promotionPolicy, specificPrices, specificPromotions, programPromotions, hospitalPrices,
                productLots: data.productLots.filter(row => row.productId === product.id && row.isActive !== 0) });
            // Không tự chọn thứ tự ưu tiên giá/khuyến mãi khi chủ dự án chưa chốt.
            if (hospitalPrices.length || specificPrices.length || specificPromotions.length || programPromotions.length || product.promotionPolicy ||
                line.promotion_policy || order.promotion_policy || (feature && (feature.isPromoted === 0 || feature.nameOnGoodsIssueInvoice || feature.addressOnGoodsIssueInvoice)) || order.isPromoted != null ||
                [product.discountRate, line.discount_rate, order.discount_rate].some(value => value != null && !new Decimal(value).isZero())) {
                warnings.push({ code: "POLICY_CONFIRMATION_REQUIRED", product_code: product.code });
            } else if (product.unitPrice != null && line.unit_price != null && !new Decimal(product.unitPrice).eq(line.unit_price)) {
                fail("PRICE_MISMATCH", { expected: String(product.unitPrice), actual: String(line.unit_price) });
            }
        }
        return {
            message_code: "CHECK_RESULT", errors, warnings, requires_review: warnings.length > 0,
            catalog_loaded_at: data.loadedAt, references,
            checks_performed: ["customer_product_existence", "active_status", "positive_quantity", "unambiguous_base_price"],
            checks_not_performed: ["promotion_entitlement", "policy_precedence", "lot_expiry", "tax"]
        };
    }

    async checkInvoice({ order, invoice }, snapshot) {
        const result = await this.checkOrder({ order }, snapshot);
        if (result.message_code === "CATALOG_NOT_READY") return result;
        const errors = [...result.errors];
        const warnings = [...result.warnings];
        if (order.customer_code !== invoice.customer_code) errors.push({ error_code: "CUSTOMER_MISMATCH" });
        const totals = rows => {
            const map = new Map();
            rows.forEach(row => map.set(row.product_code, (map.get(row.product_code) ?? new Decimal(0)).plus(row.qty)));
            return map;
        };
        const ordered = totals(order.products);
        const invoiced = totals(invoice.products);
        for (const code of new Set([...ordered.keys(), ...invoiced.keys()])) {
            if (!(ordered.get(code) ?? new Decimal(0)).eq(invoiced.get(code) ?? 0)) {
                const promotionPossible = result.references.some(reference => reference.product_code === code && (
                    reference.promotionPolicy || reference.specificPromotions.length || reference.programPromotions.length ||
                    reference.specificPrices.some(price => price.promotionPolicy)
                ));
                if (promotionPossible || order.promotion_policy) warnings.push({ code: "QUANTITY_REQUIRES_PROMOTION_REVIEW", product_code: code });
                else errors.push({ error_code: "QUANTITY_MISMATCH", product_code: code,
                    expected: String(ordered.get(code) ?? 0), actual: String(invoiced.get(code) ?? 0) });
            }
        }
        let total = new Decimal(0);
        invoice.products.forEach((line, index) => {
            const fail = (error_code, expected) => errors.push({ error_code, line: index + 1, expected: String(expected) });
            if (line.qty < 0 || line.unit_price < 0) fail("NEGATIVE_INVOICE_VALUE", ">=0");
            const amount = new Decimal(line.qty).times(line.unit_price);
            if (!amount.eq(line.amount)) fail("LINE_AMOUNT_MISMATCH", amount);
            // Chưa đoán quy tắc làm tròn/rate: chỉ đối chiếu phép trừ với số tiền CK đã khai báo.
            const net = new Decimal(line.amount).minus(line.discount_amount ?? 0);
            const knownDiscount = line.discount_amount != null || line.discount_rate == null || new Decimal(line.discount_rate).isZero();
            if (knownDiscount && !net.eq(line.net_amount)) fail("LINE_NET_MISMATCH", net);
            if (line.discount_rate != null && !new Decimal(line.discount_rate).isZero()) warnings.push({ code: "DISCOUNT_POLICY_CONFIRMATION_REQUIRED", line: index + 1 });
            total = total.plus(line.net_amount);
            const orderPrices = new Set(order.products.filter(item => item.product_code === line.product_code && item.unit_price != null).map(item => String(item.unit_price)));
            if (orderPrices.size === 1 && !new Decimal([...orderPrices][0]).eq(line.unit_price)) fail("ORDER_INVOICE_PRICE_MISMATCH", [...orderPrices][0]);
            if (orderPrices.size > 1) warnings.push({ code: "AMBIGUOUS_ORDER_PRICE", product_code: line.product_code });
        });
        const net = total.minus(invoice.discount_amount ?? 0);
        const knownDiscount = invoice.discount_amount != null || invoice.discount_rate == null || new Decimal(invoice.discount_rate).isZero();
        if (knownDiscount && !net.eq(invoice.net_amount)) errors.push({ error_code: "INVOICE_TOTAL_MISMATCH", expected: String(net) });
        if (invoice.discount_rate != null && !new Decimal(invoice.discount_rate).isZero()) warnings.push({ code: "DISCOUNT_POLICY_CONFIRMATION_REQUIRED" });
        if (invoice.products.some(line => line.lot_number || line.expiry_date)) warnings.push({ code: "LOT_EXPIRY_REVIEW_REQUIRED" });
        // Giá trên hóa đơn cũng cần kiểm tra độc lập khi đơn không khai báo đơn giá.
        const invoiceCheck = await this.checkOrder({ order: { ...order, products: invoice.products } }, snapshot);
        errors.push(...(invoiceCheck.errors ?? []).filter(error => error.error_code === "PRICE_MISMATCH"));
        return { ...result, errors, warnings, requires_review: warnings.length > 0,
            checks_performed: [...result.checks_performed, "order_invoice_customer", "order_invoice_quantity", "line_arithmetic", "declared_discount_arithmetic", "invoice_total"] };
    }
}
