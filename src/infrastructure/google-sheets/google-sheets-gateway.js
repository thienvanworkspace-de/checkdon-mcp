/**
 * Adapter Google API thuần I/O. Không chứa quy tắc đơn hàng hay danh mục.
 * Các thao tác tìm-và-ghi phải nằm chung trong withWriteLock() của một instance.
 * Hàng đợi chỉ bảo vệ một process; không thay thế transaction/unique key của MySQL.
 */
export class GoogleSheetsGateway {
    constructor({ client }) {
        this.client = client;
        this.writeQueue = Promise.resolve();
    }

    withWriteLock(operation) {
        const task = this.writeQueue.then(operation);
        // Một lần ghi lỗi không được làm hỏng toàn bộ hàng đợi sau đó.
        this.writeQueue = task.catch(() => {});
        return task;
    }

    async read(spreadsheetId, range) {
        const response = await this.client.spreadsheets.values.get({ spreadsheetId, range });
        return response.data.values || [];
    }

    async write(spreadsheetId, range, values) {
        if (!Array.isArray(values) || !values.length ||
            values.some(row => !Array.isArray(row) || !row.length)) {
            throw new Error("values phải là mảng hai chiều không rỗng.");
        }

        const response = await this.client.spreadsheets.values.update({
            spreadsheetId,
            range,
            // Nội dung Telegram là văn bản, không được biến '=...' thành công thức.
            valueInputOption: "RAW",
            requestBody: { values }
        });
        return response.data;
    }

    parseColumnRange(range) {
        const match = /^(.+)!([A-Z]+):([A-Z]+)$/i.exec(range);
        if (!match) throw new Error("Range phải có dạng 'Tên tab'!A:G.");
        const [, sheetRef, startColumn, endColumn] = match;
        const columnToNumber = column => [...column.toUpperCase()]
            .reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
        const columnCount = columnToNumber(endColumn) - columnToNumber(startColumn) + 1;
        if (columnCount < 1) throw new Error("Cột đầu phải đứng trước hoặc bằng cột cuối.");
        return { sheetRef, startColumn: startColumn.toUpperCase(), endColumn: endColumn.toUpperCase(), columnCount };
    }

    /** Ghi sau dòng có dữ liệu cuối trong phạm vi; luôn giữ lại dòng 1 cho tiêu đề. */
    async append(spreadsheetId, range, values) {
        const parsed = this.parseColumnRange(range);
        if (!Array.isArray(values) || !values.length ||
            values.some(row => !Array.isArray(row) || row.length !== parsed.columnCount)) {
            throw new Error(`Mỗi hàng phải có đúng ${parsed.columnCount} cột.`);
        }

        const existing = await this.read(spreadsheetId, range);
        let lastRow = 1;
        existing.forEach((row, index) => {
            if (row.some(cell => cell != null && String(cell).trim() !== "")) lastRow = index + 1;
        });
        const startRow = lastRow + 1;
        const target = `${parsed.sheetRef}!${parsed.startColumn}${startRow}:${parsed.endColumn}${startRow + values.length - 1}`;
        await this.write(spreadsheetId, target, values);
        return { rowNumber: startRow };
    }
}

/** Quote đúng tên tab kể cả khi tên chứa dấu nháy đơn. */
export function quoteSheetName(name) {
    return `'${name.replace(/'/g, "''")}'`;
}

/** Chỉ tạo client tại composition root khi bật postdon, MCP không cần khóa Google. */
export async function createGoogleSheetsGateway({ clientEmail, privateKey }) {
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const client = google.sheets({ version: "v4", auth, timeout: 30_000 });
    return new GoogleSheetsGateway({ client });
}
