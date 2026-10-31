import { createContainer as createAwilixContainer, asValue, asFunction, asClass, InjectionMode } from "awilix";
import { registerBusiness } from "./application/register-business.js";
import { ProductService } from "./business/product-service.js";
import { CatalogCache } from "./cache/catalog-cache.js";
import { createSequelize } from "./infrastructure/mysql/connection-factory.js";
import { createModels } from "./infrastructure/mysql/model-factory.js";
import { CatalogRepository } from "./data/mysql/catalog-repository.js";
import { OrderMysqlRepository } from "./data/mysql/order-mysql-repository.js";
import { SheetSyncRepository } from "./data/mysql/sheet-sync-repository.js";
import { OrderReconciliationService } from "./business/sync/order-reconciliation-service.js";
import { SheetSyncService } from "./business/sync/sheet-sync-service.js";
import { OrderSheetRepository } from "./data/google-sheets/order-sheet-repository.js";
import { createGoogleSheetsGateway } from "./infrastructure/google-sheets/google-sheets-gateway.js";
import { TelegramClient } from "./infrastructure/telegram/telegram-client.js";
import { TelegramPoller } from "./infrastructure/telegram/telegram-poller.js";
import { OrderProjectionWorker } from "./infrastructure/projection/order-projection-worker.js";
import { OrderUpdateHandler } from "./transports/telegram/order-update-handler.js";
import { validatePostdonConfig } from "./config/index.js";

export const emptyCatalog = () => ({ customers: [], products: [], accountants: [], customerFeatures: [],
    specificPrices: [], specificPromotions: [], programPromotions: [], productLots: [], hospitalPrices: [] });

/**
 * Composition root duy nhất: Awilix quản lý singleton và giải phóng connection pool.
 * Factory tạo connection/models, business chỉ nhận hợp đồng đã được đăng ký.
 */
export function createApplicationContainer({ config, logger = console, overrides = {} }) {
    if (!["mysql", "memory"].includes(config.dataProvider)) throw new Error("DATA_PROVIDER không hợp lệ.");
    const container = createAwilixContainer({ injectionMode: InjectionMode.PROXY, strict: true });
    container.register({
        config: asValue(config), logger: asValue(logger), databaseConfig: asValue(config.database), syncConfig: asValue(config.sync),
        sequelize: asFunction(createSequelize).singleton().disposer(connection => connection.close()),
        models: asFunction(({ sequelize }) => createModels(sequelize)).singleton(),
        catalogRepository: asClass(CatalogRepository).singleton(),
        catalogCache: asClass(CatalogCache).singleton(),
        sheetSyncRepository: asClass(SheetSyncRepository).singleton(),
        orderReconciliationService: asClass(OrderReconciliationService).singleton(),
        orderSheetRepositoryFactory: asFunction(({ config }) => {
            let promise;
            return () => {
                if (!config.postdon.clientEmail || !config.postdon.privateKey || !config.postdon.workbookId) {
                    throw new Error("Thiếu cấu hình Google để đối soát đơn.");
                }
                promise ??= createGoogleSheetsGateway(config.postdon).then(gateway => new OrderSheetRepository({
                    gateway, workbookId: config.postdon.workbookId, sheetName: config.postdon.orderSheetName,
                    sheetLayout: config.postdon.sheetLayout, columns: config.postdon.orderColumns
                })).catch(error => { promise = undefined; throw error; });
                return promise;
            };
        }).singleton(),
        sheetSyncService: asClass(SheetSyncService).singleton(),
        orderRepository: asClass(OrderMysqlRepository).singleton(),
        // Danh mục sản phẩm phục vụ các business khác cũng đọc từ cache RAM.
        productRepository: asFunction(({ catalogCache }) => ({ getProducts: async () => catalogCache.getSnapshot().products })).singleton(),
        productService: asClass(ProductService).singleton(),
        clock: asValue(() => new Date())
    });
    registerBusiness(container, config);
    if (config.dataProvider === "memory") {
        // Chỉ dành cho test/demo: không phải fallback tự động khi MySQL lỗi.
        container.register({ catalogRepository: asValue({ loadAll: async () => emptyCatalog() }) });
    }
    for (const [name, value] of Object.entries(overrides)) container.register(name, asValue(value));
    return container;
}

/** API dùng cho HTTP tests/embedding: mọi lần tạo đều đi qua Awilix. */
export function createMcpServices({ catalogCache } = {}) {
    if (!catalogCache) throw new Error("Cần CatalogCache đã khởi tạo trước khi tạo MCP services.");
    const config = { dataProvider: "memory", database: {}, sync: {} };
    return createApplicationContainer({ config, overrides: { catalogCache } }).cradle;
}

/** Đăng ký adapter Sheet chỉ để chiếu dữ liệu; đơn gốc luôn qua repository MySQL. */
export async function registerPostdon(container, { gateway, client } = {}) {
    const { config, logger } = container.cradle;
    validatePostdonConfig(config.postdon);
    if (config.dataProvider !== "mysql") throw new Error("Worker postdon yêu cầu MySQL.");
    gateway ??= await createGoogleSheetsGateway(config.postdon);
    container.register({
        gateway: asValue(gateway),
        orderSheetRepository: asFunction(({ gateway }) => new OrderSheetRepository({
            gateway, workbookId: config.postdon.workbookId, sheetName: config.postdon.orderSheetName,
            sheetLayout: config.postdon.sheetLayout, columns: config.postdon.orderColumns
        })).singleton(),
        updateHandler: asFunction(({ orderService }) => new OrderUpdateHandler({ orderService, allowedChatIds: config.postdon.allowedChatIds })).singleton(),
        telegramClient: asValue(client ?? new TelegramClient({ token: config.postdon.botToken })),
        poller: asFunction(({ telegramClient, updateHandler }) => new TelegramPoller({ client: telegramClient, handler: updateHandler, logger })).singleton(),
        projectionWorker: asClass(OrderProjectionWorker).singleton()
    });
}
