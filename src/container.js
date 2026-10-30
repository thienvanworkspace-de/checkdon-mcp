import { InvoiceService } from "./business/invoice-service.js";
import { OrderService } from "./business/order-service.js";
import { ProductService } from "./business/product-service.js";
import { OrderSheetRepository } from "./data/google-sheets/order-sheet-repository.js";
import { ProductSheetRepository } from "./data/google-sheets/product-sheet-repository.js";
import { createGoogleSheetsGateway } from "./infrastructure/google-sheets/google-sheets-gateway.js";
import { TelegramClient } from "./infrastructure/telegram/telegram-client.js";
import { TelegramPoller } from "./infrastructure/telegram/telegram-poller.js";
import { OrderUpdateHandler } from "./transports/telegram/order-update-handler.js";
import { validatePostdonConfig } from "./config/index.js";

/** Composition root: business nhận dependency, không tự tạo kết nối dữ liệu. */
export function createMcpServices() {
    return { invoiceService: new InvoiceService() };
}

export async function createPostdonServices(config, { gateway, client, logger = console } = {}) {
    validatePostdonConfig(config);
    gateway ??= await createGoogleSheetsGateway(config);
    const orderRepository = new OrderSheetRepository({
        gateway, workbookId: config.workbookId, sheetName: config.orderSheetName
    });
    const productRepository = new ProductSheetRepository({
        gateway, workbookId: config.workbookId, sheetName: config.productSheetName
    });
    const orderService = new OrderService({ orderRepository });
    const productService = new ProductService({ productRepository });
    const handler = new OrderUpdateHandler({ orderService, allowedChatIds: config.allowedChatIds });
    const poller = new TelegramPoller({
        client: client ?? new TelegramClient({ token: config.botToken }), handler, logger
    });
    return { orderService, productService, poller };
}
