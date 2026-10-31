import { parseSyncEvent } from "./schemas.js";

/** Sau commit MySQL mới công bố snapshot mới. Lỗi refresh không được trả thành công giả. */
export class SheetSyncService {
    constructor({ sheetSyncRepository, catalogCache, syncConfig, orderReconciliationService }) {
        this.repository = sheetSyncRepository;
        this.cache = catalogCache;
        this.config = syncConfig;
        this.reconciliation = orderReconciliationService;
        this.queue = Promise.resolve();
    }

    accept(input) {
        const event = parseSyncEvent(input);
        if (event.spreadsheetId !== this.config.spreadsheetId) {
            throw Object.assign(new Error("Workbook không được phép."), { status: 403 });
        }
        const task = this.queue.then(async () => {
            const result = event.entity === "orderReconciliation"
                ? await this.reconciliation.reconcile()
                : await this.repository.apply(event);
            // Retry sau lỗi cache phải refresh cả khi DB báo duplicate (commit trước đó đã thành công).
            try {
                if (!this.cache.ready) await this.cache.refresh();
                else if (result.applied && result.catalogChanged !== false) {
                    if (result.cacheChanges && this.cache.applyChanges) await this.cache.applyChanges(result.cacheChanges);
                    else { this.cache.invalidate(); await this.cache.refresh(); }
                }
            } catch (error) { this.cache.invalidate(); throw error; }
            const { cacheChanges, ...ack } = result;
            return { ...ack, eventId: event.eventId, cacheReady: true };
        });
        this.queue = task.catch(() => {});
        return task;
    }
}
