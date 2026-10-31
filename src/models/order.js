import { OrderRecord } from "./order-record.js";

/** Đơn đang theo dõi. */
export class Order extends OrderRecord {
    static table = "orders";
}
