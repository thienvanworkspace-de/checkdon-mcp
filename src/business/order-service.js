/** Nghiệp vụ nhận/sửa đơn. Không biết Telegram, địa chỉ Sheet hay câu lệnh SQL. */
export class OrderService {
    constructor({ orderRepository, clock = () => new Date() }) {
        this.orders = orderRepository;
        this.clock = clock;
    }

    normalizeKey(key) {
        if (typeof key !== "string" || !key.trim()) {
            throw new Error("order key phải là chuỗi không rỗng.");
        }
        return key.trim();
    }

    async postOrder(key, content) {
        key = this.normalizeKey(key);
        if (typeof content !== "string" || !content.trim()) {
            return { created: false, key, reason: "EMPTY_CONTENT" };
        }

        return this.orders.createIfAbsent({ key, content, createdAt: this.clock() });
    }

    async updateOrder(key, content) {
        key = this.normalizeKey(key);
        if (typeof content !== "string" || !content.trim()) {
            return { updated: false, key, reason: "EMPTY_CONTENT" };
        }

        return this.orders.updateContent(key, content);
    }
}
