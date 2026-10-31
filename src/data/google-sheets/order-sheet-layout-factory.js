/** Layout Factory: schema MySQL/business không phụ thuộc thiết kế Sheet đang chỉnh sửa. */
export function createOrderSheetLayout(type, headers = [], columnNames = {}) {
    if (type === "postdon") return { width: 7, key: 0, content: 2, date: 4 };
    if (type !== "accounting") throw new Error("ORDER_SHEET_LAYOUT không hợp lệ.");
    const names = { key: "_order_key", content: "Nội dung", date: "Ngày", status: "Trạng thái",
        supplement: "Bổ sung", checked: "Checked", ordersChecked: "Orders_checked", ...columnNames };
    const layout = { width: headers.length };
    for (const [field, name] of Object.entries(names)) {
        const matches = headers.map((header, index) => header === name ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new Error(`Cột ${name} bị thiếu hoặc trùng; cần kiểm tra mapping Sheet.`);
        layout[field] = matches[0];
    }
    return layout;
}

export function columnName(index) {
    let result = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
        result = String.fromCharCode(65 + (value - 1) % 26) + result;
    }
    return result;
}
