import { runMysqlTransaction } from "../../infrastructure/mysql/transaction-runner.js";
import { createHash } from "node:crypto";
import { catalogModels } from "./catalog-repository.js";
import { recordKey } from "../../business/sync/schemas.js";

/** Transactional inbox: version theo từng bản ghi, tránh mất dữ liệu khi hai dòng đến lệch thứ tự. */
export class SheetSyncRepository {
    constructor({ sequelize, models, orderRepository }) { this.sequelize = sequelize; this.models = models; this.orders = orderRepository; }

    async apply(event) {
        const scope = createHash("sha256").update(JSON.stringify([
            event.spreadsheetId, event.entity, recordKey(event.entity, event.row)
        ])).digest("hex");
        const payloadHash = createHash("sha256").update(JSON.stringify(event.row)).digest("hex");
        return runMysqlTransaction(this.sequelize, async transaction => {
            await this.models.SyncCursor.bulkCreate([{ scope, version: 0 }], { ignoreDuplicates: true, transaction });
            const cursor = await this.models.SyncCursor.findByPk(scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (BigInt(event.version) <= BigInt(cursor.version)) {
                if (BigInt(event.version) === BigInt(cursor.version) && cursor.payloadHash !== payloadHash) {
                    throw Object.assign(new Error("Cùng version nhưng khác dữ liệu."), { code: "VERSION_CONFLICT", status: 409 });
                }
                return { applied: false, reason: "STALE_OR_DUPLICATE" };
            }
            if (cursor.payloadHash === payloadHash) {
                cursor.version = String(event.version);
                await cursor.save({ transaction });
                return { applied: false, reason: "UNCHANGED" };
            }
            const row = { ...event.row };
            if (event.entity === "orders") {
                await this.orders.importFromSheet(row, transaction);
                cursor.version = String(event.version);
                cursor.payloadHash = payloadHash;
                await cursor.save({ transaction });
                return { applied: true, catalogChanged: false };
            }
            const features = row.features;
            delete row.features;
            // Mã nghiệp vụ được đổi sang khóa ngoại trong transaction, không tin ID do client gửi.
            for (const [field, modelName, target] of [
                ["customerCode", "Customer", "customerId"], ["productCode", "Product", "productId"]
            ]) {
                if (!(field in row)) continue;
                const code = row[field];
                delete row[field];
                if (code == null) { row[target] = null; continue; }
                const parent = await this.models[modelName].findOne({ where: { code }, transaction });
                if (!parent) throw Object.assign(new Error("Chưa có bản ghi cha."), { code: "REFERENCE_NOT_FOUND", status: 409 });
                row[target] = parent.id;
            }
            await this.models[catalogModels[event.entity]].upsert(row, { transaction });
            const keys = {
                customers: ["code"], products: ["code"], accountants: ["email"], customerFeatures: ["customerId"],
                specificPrices: ["customerId", "productId"], specificPromotions: ["customerId", "productId"],
                programPromotions: ["sourceKey"], productLots: ["productId", "lotNumber"], hospitalPrices: ["customerId", "productId"]
            };
            const where = Object.fromEntries(keys[event.entity].map(key => [key, row[key]]));
            const saved = await this.models[catalogModels[event.entity]].findOne({ where, transaction, raw: true });
            const cacheChanges = { [event.entity]: [saved] };
            if (event.entity === "customers" && features) {
                const customer = await this.models.Customer.findOne({ where: { code: row.code }, transaction });
                await this.models.CustomerFeature.upsert({ customerId: customer.id, ...features }, { transaction });
                cacheChanges.customerFeatures = [await this.models.CustomerFeature.findOne({
                    where: { customerId: customer.id }, raw: true, transaction
                })];
            }
            cursor.version = String(event.version);
            cursor.payloadHash = payloadHash;
            await cursor.save({ transaction });
            return { applied: true, catalogChanged: true, cacheChanges };
        });
    }
}
