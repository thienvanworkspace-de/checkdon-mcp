/** Đọc cấu hình tại lúc khởi động, không kết nối dịch vụ trong lúc import module. */
export function loadConfig(env = process.env) {
    const port = Number(env.PORT || 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("PORT phải là số nguyên từ 0 đến 65535.");
    }

    return {
        port,
        dataProvider: env.DATA_PROVIDER || "mysql",
        database: {
            name: env.DB_NAME, username: env.DB_USERNAME, password: env.DB_PASSWORD,
            host: env.DB_HOST, port: Number(env.DB_PORT || 3306), ca: env.DB_CA, tls: env.DB_TLS !== "false"
        },
        sync: { secret: env.SHEET_SYNC_SECRET, spreadsheetId: env.CHECKDON_WORKBOOK_ID },
        authkitIssuer: env.AUTHKIT_ISSUER || "https://right-haven-96-staging.authkit.app",
        mcpResourceUrl: env.MCP_RESOURCE_URL || "https://site--checkdon-mcp--6zt5v8kxj6g9.code.run/mcp",
        allowedHosts: env.ALLOWED_HOSTS?.split(",").map(value => value.trim()).filter(Boolean),
        allowedEmails: [
            "thienvanworkspace@gmail.com",
            "nxde2000@gmail.com",
            "nhungcun250119@gmail.com"
        ],
        postdon: {
            botToken: env.TELEGRAM_BOT_TOKEN,
            allowedChatIds: env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").map(value => value.trim()).filter(Boolean) || [],
            workbookId: env.CHECKDON_WORKBOOK_ID,
            sheetLayout: env.ORDER_SHEET_LAYOUT || "postdon",
            orderColumns: JSON.parse(env.ORDER_SHEET_COLUMNS || "{}"),
            orderSheetName: env.ORDER_SHEET_NAME || "Đơn Hàng",
            productSheetName: env.PRODUCT_SHEET_NAME || "Sản Phẩm",
            clientEmail: env.GOOGLE_CLIENT_EMAIL,
            privateKey: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
        }
    };
}

/** Chỉ yêu cầu khóa Google/Telegram khi người dùng chủ động bật service postdon. */
export function validatePostdonConfig(config) {
    const required = {
        TELEGRAM_BOT_TOKEN: config.botToken,
        CHECKDON_WORKBOOK_ID: config.workbookId,
        GOOGLE_CLIENT_EMAIL: config.clientEmail,
        GOOGLE_PRIVATE_KEY: config.privateKey
    };
    const missing = Object.keys(required).filter(name => !required[name]?.trim());
    if (missing.length) throw new Error(`Thiếu cấu hình postdon: ${missing.join(", ")}.`);
}
