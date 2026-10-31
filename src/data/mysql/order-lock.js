import { createHash } from "node:crypto";

/** Khóa logic chung giữa tạo/sửa/chuyển kho, kể cả khi orders chưa có dòng tương ứng. */
export async function lockOrder(models, key, transaction) {
    const scope = `order:${createHash("sha256").update(key).digest("hex")}`;
    await models.SyncCursor.bulkCreate([{ scope, version: 0 }], { ignoreDuplicates: true, transaction });
    await models.SyncCursor.findByPk(scope, { transaction, lock: transaction.LOCK.UPDATE });
}
