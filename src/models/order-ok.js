import { OrderRecord } from "./order-record.js";

/** Đơn đã chuyển kho; không tự khôi phục khi Telegram replay. */
export class OrderOk extends OrderRecord {
    static table = "orders_ok";
}
