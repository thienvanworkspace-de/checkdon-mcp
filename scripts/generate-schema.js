import { Sequelize } from "sequelize";
import { writeFile } from "node:fs/promises";
import { createModels } from "../src/infrastructure/mysql/model-factory.js";

// Chỉ sinh SQL từ metadata. Không authenticate, sync, tạo CSDL hay chạy SQL.
const sequelize = new Sequelize("schema_only", "unused", "", { dialect: "mysql", logging: false });
const models = createModels(sequelize);
const generator = sequelize.getQueryInterface().queryGenerator;
const statements = ["-- Generated schema for a NEW MySQL database; review before executing.",
    "-- No automatic migration at startup. Existing legacy tables require a separate migration plan."];
for (const model of Object.values(models)) {
    const attributes = generator.attributesToSQL(model.getAttributes(), { table: model.tableName });
    statements.push(generator.createTableQuery(model.tableName, attributes, {
        uniqueKeys: model.uniqueKeys, charset: "utf8mb4", collate: "utf8mb4_bin", engine: "InnoDB"
    }));
    for (const index of model.options.indexes) statements.push(generator.addIndexQuery(model.tableName, index) + ";");
}
await writeFile(new URL("../migrations/001-initial.sql", import.meta.url), statements.join("\n\n") + "\n");
await sequelize.close();
console.log("Đã sinh migrations/001-initial.sql từ metadata; không kết nối database.");
