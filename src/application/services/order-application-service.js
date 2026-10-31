/** Facade cho Telegram; không để transport gọi trực tiếp repository/SQL/business engine. */
export class OrderApplicationService {
    constructor({ businessGateway }) { this.gateway = businessGateway; }
    postOrder(key, content) {
        return this.gateway.execute("orders.create", { key, content }, { source: "telegram" });
    }
    updateOrder(key, content) {
        return this.gateway.execute("orders.updateContent", { key, content }, { source: "telegram" });
    }
}
