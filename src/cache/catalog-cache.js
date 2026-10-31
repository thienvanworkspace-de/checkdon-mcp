/** Snapshot RAM được thay nguyên khối. Full load khi startup/recovery; patch sau từng commit. */
export class CatalogCache {
    #data;
    constructor({ catalogRepository, clock = () => new Date() }) {
        this.repository = catalogRepository;
        this.clock = clock;
        this.state = null;
        this.ready = false;
        this.refreshQueue = Promise.resolve();
    }

    enqueue(operation) {
        const task = this.refreshQueue.then(operation);
        this.refreshQueue = task.catch(() => {});
        return task;
    }

    publish(data) {
        this.#data = structuredClone(data);
        const frozen = freezeData(data);
        const customers = new Map(frozen.customers.map(row => [row.code, row]));
        const products = new Map(frozen.products.map(row => [row.code, row]));
        this.state = Object.freeze({ ...frozen, loadedAt: this.clock().toISOString(),
            customer: code => customers.get(code), product: code => products.get(code) });
        this.ready = true;
        return this.state;
    }

    refresh() { return this.enqueue(async () => this.publish(await this.repository.loadAll())); }

    /** Các bản ghi trả về từ transaction MySQL được merge theo ID, không tải lại cả DB. */
    applyChanges(changes) {
        return this.enqueue(async () => {
            if (!this.ready) throw new Error("Cache cần full refresh trước khi patch.");
            const next = structuredClone(this.#data);
            for (const [entity, records] of Object.entries(changes)) {
                if (!Array.isArray(next[entity])) throw new Error("Entity cache không hợp lệ.");
                for (const record of records) {
                    const index = next[entity].findIndex(existing => existing.id === record.id);
                    if (index < 0) next[entity].push(record);
                    else next[entity][index] = record;
                }
            }
            return this.publish(next);
        });
    }

    invalidate() { this.ready = false; }
    getSnapshot() {
        if (!this.ready) throw Object.assign(new Error("Danh mục chưa sẵn sàng."), { code: "CATALOG_NOT_READY" });
        return this.state;
    }
}

// Date được đổi thành chuỗi: Object.freeze(Date) vẫn cho phép gọi setTime().
function freezeData(value) {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return Object.freeze(value.map(freezeData));
    if (value && typeof value === "object") return Object.freeze(Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeData(entry)])
    ));
    return value;
}
