/** Chuyển Telegram update thành lời gọi business; không truy cập Sheet trực tiếp. */
export class OrderUpdateHandler {
    constructor({ orderService, allowedChatIds = [] }) {
        this.orderService = orderService;
        this.allowedChatIds = new Set(allowedChatIds.map(String));
    }

    async handle(update) {
        const message = update.message ?? update.edited_message;
        if (!message || !["group", "supergroup"].includes(message.chat?.type) ||
            !message.from || message.from.is_bot) {
            return { ignored: true, reason: "UNSUPPORTED_MESSAGE" };
        }
        if (this.allowedChatIds.size && !this.allowedChatIds.has(String(message.chat.id))) {
            return { ignored: true, reason: "CHAT_NOT_ALLOWED" };
        }

        const key = `${message.chat.id}:${message.message_id}`;
        const content = message.text ?? message.caption ?? "";
        return update.edited_message
            ? this.orderService.updateOrder(key, content)
            : this.orderService.postOrder(key, content);
    }
}
