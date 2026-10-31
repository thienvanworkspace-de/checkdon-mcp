import { setTimeout as delay } from "node:timers/promises";

/** Retry toàn bộ transaction đã rollback khi MySQL báo deadlock/lock timeout. */
export async function runMysqlTransaction(sequelize, operation) {
    for (let attempt = 0; ; attempt++) {
        try { return await sequelize.transaction(operation); }
        catch (error) {
            const code = error.original?.code ?? error.parent?.code;
            if (attempt >= 2 || !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(code)) throw error;
            await delay(50 * (attempt + 1));
        }
    }
}
