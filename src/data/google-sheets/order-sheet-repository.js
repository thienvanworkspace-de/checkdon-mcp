import { OrderRepository } from "../contracts/order-repository.js";
import { quoteSheetName } from "../../infrastructure/google-sheets/google-sheets-gateway.js";

/** Giữ layout của postdon: A=key, C=nội dung, E=thời điểm nhận; B/D/F/G để trống. */
export class OrderSheetRepository extends OrderRepository {
    constructor({ gateway, workbookId, sheetName = "Đơn Hàng" }) {
        super();
        this.gateway = gateway;
        this.workbookId = workbookId;
        this.sheetRef = quoteSheetName(sheetName);
    }

    async findRowByKey(key) {
        const rows = await this.gateway.read(this.workbookId, `${this.sheetRef}!A:A`);
        const matches = [];
        // Dòng 1 là tiêu đề, số dòng Sheets bắt đầu từ 1.
        for (let index = 1; index < rows.length; index++) {
            if (String(rows[index]?.[0] ?? "").trim() === key) matches.push(index + 1);
        }
        if (matches.length > 1) {
            const error = new Error(`Key ${key} bị trùng tại các dòng ${matches.join(", ")}.`);
            error.code = "DUPLICATE_ORDER_KEY";
            throw error;
        }
        return matches[0] ?? null;
    }

    createIfAbsent({ key, content, createdAt }) {
        // Khóa cả bước tìm và ghi để hai Telegram update không cùng tạo một đơn.
        return this.gateway.withWriteLock(async () => {
            const existing = await this.findRowByKey(key);
            if (existing !== null) return { created: false, key, reason: "ORDER_EXISTS" };

            const timestamp = createdAt.toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
            const result = await this.gateway.append(this.workbookId, `${this.sheetRef}!A:G`, [
                [key, "", content, "", timestamp, "", ""]
            ]);
            return { created: true, key, rowNumber: result.rowNumber };
        });
    }

    updateContent(key, content) {
        return this.gateway.withWriteLock(async () => {
            const rowNumber = await this.findRowByKey(key);
            if (rowNumber === null) return { updated: false, key, reason: "ORDER_NOT_FOUND" };

            // Chỉ đổi cột C; không làm mất các ô nghiệp vụ do người dùng nhập thêm.
            await this.gateway.write(this.workbookId, `${this.sheetRef}!C${rowNumber}`, [[content]]);
            return { updated: true, key, rowNumber };
        });
    }
}
