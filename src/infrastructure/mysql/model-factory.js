import { DataTypes } from "sequelize";

/** Model Factory: không import connection toàn cục, không tự tạo/sửa bảng khi import. */
export function createModels(sequelize) {
    const code = () => ({ type: DataTypes.STRING(100), allowNull: false, unique: true });
    const text = () => ({ type: DataTypes.STRING(255), allowNull: true });
    const money = () => ({ type: DataTypes.DECIMAL(15, 2), allowNull: true });
    const foreign = () => ({ type: DataTypes.INTEGER, allowNull: false });
    const active = () => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
    const define = (name, tableName, fields, options = {}) => sequelize.define(name, { ...fields, ...(tableName !== "sync_cursors" && tableName !== "order_projections" ? { sourceData: { type: DataTypes.JSON, allowNull: true } } : {}) }, {
        tableName, timestamps: true, charset: "utf8mb4", collate: "utf8mb4_bin", ...options
    });

    // Các trường nghiệp vụ giữ từ learn_sqlize; tên bảng được khai báo tường minh.
    const Customer = define("Customer", "customers", {
        code: code(), name: { type: DataTypes.STRING, allowNull: false },
        address: text(), province: text(), category: DataTypes.INTEGER,
        hasFeatures: DataTypes.INTEGER, isActive: active()
    });
    const Product = define("Product", "products", {
        code: code(), name: { type: DataTypes.STRING, allowNull: false }, unit: text(),
        unitPrice: money(), promotionPolicy: text(), discountRate: money(), isActive: active()
    });
    const Accountant = define("Accountant", "accountants", {
        name: text(), email: { type: DataTypes.STRING, allowNull: false, unique: true }, address: text()
    });
    const CustomerFeature = define("CustomerFeature", "customer_features", {
        customerId: { ...foreign(), unique: true }, isPromoted: DataTypes.INTEGER,
        nameOnGoodsIssueInvoice: text(), addressOnGoodsIssueInvoice: text()
    });
    const pairIndex = () => [{ unique: true, fields: ["customerId", "productId"] }];
    const SpecificPrice = define("SpecificPrice", "specific_prices", {
        customerId: foreign(), productId: foreign(), unitPrice: money(), discountRate: money(), promotionPolicy: text(), isActive: active()
    }, { indexes: pairIndex() });
    const SpecificPromotion = define("SpecificPromotion", "specific_promotions", {
        customerId: foreign(), productId: foreign(), buy: DataTypes.INTEGER, present: DataTypes.INTEGER, isActive: active()
    }, { indexes: pairIndex() });
    const ProgramPromotion = define("ProgramPromotion", "program_promotions", {
        sourceKey: code(), promotionPolicy: text(), productId: { type: DataTypes.INTEGER, allowNull: true },
        fromDate: DataTypes.DATEONLY, toDate: DataTypes.DATEONLY,
        buy: DataTypes.INTEGER, present: DataTypes.INTEGER, isActive: active()
    });
    const ProductLot = define("ProductLot", "product_lots", {
        productId: foreign(), lotNumber: { type: DataTypes.STRING(100), allowNull: false },
        // Giữ nguyên độ chính xác ngày/tháng từ Sheet, không tự đoán ngày cuối tháng.
        expiryDate: { type: DataTypes.STRING(50), allowNull: false }, isActive: active()
    }, { indexes: [{ unique: true, fields: ["productId", "lotNumber"] }] });
    const HospitalPrice = define("HospitalPrice", "hospital_prices", {
        customerId: foreign(), productId: foreign(), unitPrice: money(), discountRate: money(),
        soldQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: true }, isActive: active()
    }, { indexes: pairIndex() });
    // Factory dùng chung bảo đảm orders và orders_ok có cùng cấu trúc.
    const orderFields = () => ({
        key: { type: DataTypes.STRING(191), allowNull: false, unique: true },
        content: { type: DataTypes.TEXT, allowNull: false },
        receivedAt: { type: DataTypes.DATE, allowNull: false }, sheetDate: text(),
        status: text(), supplement: { type: DataTypes.TEXT, allowNull: true },
        checked: { type: DataTypes.JSON, allowNull: true }, ordersChecked: { type: DataTypes.JSON, allowNull: true },
        sheetFields: { type: DataTypes.JSON, allowNull: true }, projectedAt: { type: DataTypes.DATE, allowNull: true },
        revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
    });
    const Order = define("Order", "orders", orderFields());
    const OrderOk = define("OrderOk", "orders_ok", orderFields());
    const OrderProjection = define("OrderProjection", "order_projections", {
        orderKey: { type: DataTypes.STRING(191), primaryKey: true },
        revision: { type: DataTypes.INTEGER, allowNull: false },
        payload: { type: DataTypes.JSON, allowNull: false }
    });
    const SyncCursor = define("SyncCursor", "sync_cursors", {
        scope: { type: DataTypes.STRING(191), primaryKey: true },
        version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
        payloadHash: { type: DataTypes.STRING(64), allowNull: true }
    });

    // Đăng ký quan hệ sau khi tất cả model đã tồn tại để không phụ thuộc thứ tự import.
    Customer.hasOne(CustomerFeature, { foreignKey: "customerId", as: "features" });
    CustomerFeature.belongsTo(Customer, { foreignKey: "customerId" });
    for (const model of [SpecificPrice, SpecificPromotion, HospitalPrice]) {
        model.belongsTo(Customer, { foreignKey: "customerId" });
        model.belongsTo(Product, { foreignKey: "productId" });
    }
    ProductLot.belongsTo(Product, { foreignKey: "productId" });
    ProgramPromotion.belongsTo(Product, { foreignKey: "productId" });
    return { Customer, Product, Accountant, CustomerFeature, SpecificPrice, SpecificPromotion,
        ProgramPromotion, ProductLot, HospitalPrice, Order, OrderOk, OrderProjection, SyncCursor };
}
