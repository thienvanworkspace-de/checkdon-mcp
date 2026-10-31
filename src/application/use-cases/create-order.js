/** Use case tạo đơn: luật và repository hiện tại giữ transaction + outbox; DTO không lộ số dòng Sheet. */
export class CreateOrder {
    constructor({ orderRules }) { this.rules = orderRules; }
    async execute({ key, content }) {
        const result = await this.rules.postOrder(key, content);
        return { created: result.created, key: result.key, ...(result.reason ? { reason: result.reason } : {}) };
    }
}
