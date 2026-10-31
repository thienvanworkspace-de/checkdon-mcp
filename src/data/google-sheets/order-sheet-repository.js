import { OrderRepository } from "../contracts/order-repository.js";
import { quoteSheetName } from "../../infrastructure/google-sheets/google-sheets-gateway.js";
import { createOrderSheetLayout, columnName } from "./order-sheet-layout-factory.js";

/** Adapter bản chiếu Sheet. Layout code Postdon là mặc định, Sheet kế toán cũ là profile riêng. */
export class OrderSheetRepository extends OrderRepository {
    constructor({ gateway, workbookId, sheetName = "Đơn Hàng", sheetLayout = "postdon", columns = {} }) {
        super();
        this.gateway = gateway;
        this.workbookId = workbookId;
        this.sheetRef = quoteSheetName(sheetName);
        this.layoutType = sheetLayout;
        this.columnNames = columns;
    }

    async readTable() {
        const range = `${this.sheetRef}!A:${this.layoutType === "postdon" ? "G" : "ZZ"}`;
        const rows = await this.gateway.read(this.workbookId, range);
        const layout = createOrderSheetLayout(this.layoutType, rows[0] ?? [], this.columnNames);
        return { rows, layout };
    }

    locate(rows, layout, key) {
        const matches = [];
        for (let index = 1; index < rows.length; index++) {
            if (String(rows[index]?.[layout.key] ?? "").trim() === key) matches.push(index + 1);
        }
        if (matches.length > 1) throw Object.assign(new Error(`Key ${key} bị trùng tại các dòng ${matches.join(", ")}.`), { code: "DUPLICATE_ORDER_KEY" });
        return matches[0] ?? null;
    }

    async findRowByKey(key) {
        const { rows, layout } = await this.readTable();
        return this.locate(rows, layout, key);
    }

    createIfAbsent({ key, content, createdAt }) {
        return this.gateway.withWriteLock(async () => {
            const { rows, layout } = await this.readTable();
            if (this.locate(rows, layout, key) !== null) return { created: false, key, reason: "ORDER_EXISTS" };
            const row = Array(layout.width).fill("");
            row[layout.key] = key;
            row[layout.content] = content;
            row[layout.date] = createdAt.toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
            const result = await this.gateway.append(this.workbookId, `${this.sheetRef}!A:${columnName(layout.width - 1)}`, [row]);
            return { created: true, key, rowNumber: result.rowNumber };
        });
    }

    updateContent(key, content) {
        return this.gateway.withWriteLock(async () => {
            const { rows, layout } = await this.readTable();
            const rowNumber = this.locate(rows, layout, key);
            if (rowNumber === null) return { updated: false, key, reason: "ORDER_NOT_FOUND" };
            await this.gateway.write(this.workbookId, `${this.sheetRef}!${columnName(layout.content)}${rowNumber}`, [[content]]);
            return { updated: true, key, rowNumber };
        });
    }

    /** Không được suy ra xóa khi layout/key sai hoặc Sheet đang chưa có khóa kỹ thuật. */
    async listKeys() {
        const { rows, layout } = await this.readTable();
        if (!rows.length) throw new Error("Sheet thiếu dòng tiêu đề; không đối soát xóa.");
        const keys = new Set();
        for (const row of rows.slice(1)) {
            if (!row.some(value => value != null && String(value).trim())) continue;
            const key = String(row[layout.key] ?? "").trim();
            if (!/^(?:-?\d+:\d+|sheet:[a-z0-9-]+)$/.test(key) || keys.has(key)) throw new Error("Sheet có key thiếu/sai/trùng; không đối soát xóa.");
            keys.add(key);
        }
        return keys;
    }
}
