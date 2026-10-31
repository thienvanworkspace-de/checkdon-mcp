import { setTimeout as delay } from "node:timers/promises";

/** Outbox: MySQL là nguồn chính, Sheet chỉ là bản chiếu phục vụ kế toán theo dõi. */
export class OrderProjectionWorker {
    constructor({ models, orderSheetRepository, logger = console }) {
        this.jobs = models.OrderProjection;
        this.orders = models.Order;
        this.sheet = orderSheetRepository;
        this.logger = logger;
    }

    async flush() {
        const jobs = await this.jobs.findAll({ order: [["updatedAt", "ASC"]], limit: 100, raw: true });
        for (const job of jobs) {
            const order = { ...job.payload, createdAt: new Date(job.payload.createdAt) };
            await this.sheet.createIfAbsent(order);
            await this.sheet.updateContent(order.key, order.content);
            // Nếu Telegram vừa tạo revision mới, không được xóa job mới bằng ACK cũ.
            await this.orders.update({ projectedAt: new Date() }, { where: { key: job.orderKey, revision: job.revision } });
            await this.jobs.destroy({ where: { orderKey: job.orderKey, revision: job.revision } });
        }
    }

    async run(signal) {
        while (!signal.aborted) {
            try { await this.flush(); }
            catch { this.logger.warn("Chưa chiếu được đơn MySQL sang Sheet; giữ outbox để thử lại."); }
            await delay(3000, undefined, { signal }).catch(error => { if (!signal.aborted) throw error; });
        }
    }
}
