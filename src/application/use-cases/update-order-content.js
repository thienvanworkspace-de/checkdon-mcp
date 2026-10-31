/** Use case sửa nội dung: giữ quy tắc không tự tạo đơn nếu key không tồn tại. */
export class UpdateOrderContent {
    constructor({ orderRules }) { this.rules = orderRules; }
    async execute({ key, content }) {
        const result = await this.rules.updateOrder(key, content);
        return { updated: result.updated, key: result.key, ...(result.reason ? { reason: result.reason } : {}) };
    }
}
