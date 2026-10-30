/** Nghiệp vụ hóa đơn. Chưa có chính sách giá để kết luận đúng/sai thực tế. */
export class InvoiceService {
    async checkInvoice({ order, invoice }) {
        const output = {
            message_code: "DEMO_ONLY",
            message:
                `Đã nhận đơn ${order.order_number} và ` +
                `hóa đơn ${invoice.invoice_number}. ` +
                "API hiện chỉ chạy chế độ demo, chưa kiểm tra " +
                "giá, chiết khấu hoặc khuyến mãi. " +
                "Các lỗi bên dưới chỉ là dữ liệu minh họa.",
            errors: [
                {
                    error_code: "DEMO_PRICE_MISMATCH",
                    error_message:
                        "[DỮ LIỆU MẪU] Đơn giá trên hóa đơn " +
                        "có thể khác giá được phép áp dụng."
                },
                {
                    error_code: "DEMO_PROMOTION_MISMATCH",
                    error_message:
                        "[DỮ LIỆU MẪU] Khuyến mãi trên hóa đơn " +
                        "có thể chưa phù hợp với chính sách."
                }
            ]
        };

        return output;
    }
}
