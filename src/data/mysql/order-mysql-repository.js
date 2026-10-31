import { runMysqlTransaction } from "../../infrastructure/mysql/transaction-runner.js";
import { Op } from "sequelize";
import { lockOrder } from "./order-lock.js";
import { OrderRepository } from "../contracts/order-repository.js";

/** Lưu đơn và outbox trong cùng transaction; không phụ thuộc tình trạng Google Sheets. */
export class OrderMysqlRepository extends OrderRepository {
    constructor({ sequelize, models }) { super(); this.sequelize = sequelize; this.models = models; }

    async enqueue(order, transaction) {
        await this.models.OrderProjection.upsert({
            orderKey: order.key, revision: order.revision,
            payload: { key: order.key, content: order.content, createdAt: order.receivedAt }
        }, { transaction });
    }

    createIfAbsent({ key, content, createdAt }) {
        return runMysqlTransaction(this.sequelize, async transaction => {
            await lockOrder(this.models, key, transaction);
            if (await this.models.OrderOk.findOne({ where: { key }, transaction })) return { created: false, key, reason: "ORDER_ARCHIVED" };
            const [order, created] = await this.models.Order.findOrCreate({
                where: { key }, defaults: { content, receivedAt: createdAt, revision: 1 }, transaction
            });
            if (created) await this.enqueue(order, transaction);
            return { created, key, ...(!created ? { reason: "ORDER_EXISTS" } : {}) };
        });
    }

    updateContent(key, content) {
        return runMysqlTransaction(this.sequelize, async transaction => {
            await lockOrder(this.models, key, transaction);
            const order = await this.models.Order.findOne({ where: { key }, transaction, lock: transaction.LOCK.UPDATE });
            if (!order) return { updated: false, key, reason: "ORDER_NOT_FOUND" };
            order.content = content;
            order.revision += 1;
            await order.save({ transaction });
            await this.enqueue(order, transaction);
            return { updated: true, key };
        });
    }

    /** Sheet là giao diện chỉnh sửa; cập nhật DB nhưng không tạo outbox gây vòng lặp. */
    async importFromSheet(row, transaction) {
        await lockOrder(this.models, row.key, transaction);
        if (await this.models.OrderOk.findOne({ where: { key: row.key }, transaction })) {
            throw Object.assign(new Error("Đơn đã ở orders_ok."), { code: "ORDER_ARCHIVED", status: 409 });
        }
        const current = await this.models.Order.findOne({ where: { key: row.key }, transaction });
        // Không ghi đè nội dung Telegram mới hơn đang chờ chiếu ra Sheet.
        if (await this.models.OrderProjection.findByPk(row.key, { transaction })) {
            throw Object.assign(new Error("Đơn đang chờ chiếu."), { code: "ORDER_PROJECTION_PENDING", status: 409 });
        }
        const fields = { ...row, revision: (current?.revision ?? 0) + 1,
            receivedAt: row.receivedAt ? new Date(row.receivedAt) : (current?.receivedAt ?? new Date()), projectedAt: new Date() };
        if (current) await current.update(fields, { transaction });
        else await this.models.Order.create(fields, { transaction });
    }

    /** Chỉ archive đơn đã từng chiếu, không có outbox và thực sự vắng mặt trên Sheet. */
    async archiveMissingOrders(presentKeys, cutoff) {
        const candidates = await this.models.Order.findAll({
            where: { projectedAt: { [Op.ne]: null, [Op.lte]: cutoff } }, raw: true
        });
        let archived = 0;
        for (const candidate of candidates) {
            if (presentKeys.has(candidate.key)) continue;
            archived += await runMysqlTransaction(this.sequelize, async transaction => {
                await lockOrder(this.models, candidate.key, transaction);
                const order = await this.models.Order.findOne({ where: { key: candidate.key }, transaction });
                if (!order || !order.projectedAt || new Date(order.projectedAt) > cutoff ||
                    await this.models.OrderProjection.findByPk(candidate.key, { transaction })) return 0;
                // Cùng schema: giữ ID, sáu trường kế toán, metadata và timestamp trước khi xóa.
                await this.models.OrderOk.upsert(order.get({ plain: true }), { transaction });
                await order.destroy({ transaction });
                return 1;
            });
        }
        return { archived };
    }

}
