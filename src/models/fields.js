import { DataTypes } from "sequelize";

// Trả object mới cho mỗi lần đăng ký; Sequelize có thể bổ sung metadata/index name.
export const code = () => ({ type: DataTypes.STRING(100), allowNull: false, unique: true });
export const text = () => ({ type: DataTypes.STRING(255), allowNull: true });
export const money = () => ({ type: DataTypes.DECIMAL(15, 2), allowNull: true });
export const foreign = () => ({ type: DataTypes.INTEGER, allowNull: false });
export const active = () => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
export const pairIndex = () => [{ unique: true, fields: ["customerId", "productId"] }];
