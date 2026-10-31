import { writeFile } from "node:fs/promises";
import * as z from "zod/v4";
import { businessRequestSchema, businessResponseSchema } from "../src/application/contracts/business-contract.js";

// Artifact cho Java/C#/SQL: không phụ thuộc SDK MCP hoặc Sequelize, không kết nối dịch vụ.
for (const [name, schema] of [["request", businessRequestSchema], ["response", businessResponseSchema]]) {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
    json.$id = `urn:checkdon:business:v1:${name}`;
    await writeFile(new URL(`../contracts/business/v1/${name}.schema.json`, import.meta.url), JSON.stringify(json, null, 2) + "\n");
}
console.log("Đã xuất JSON Schema business contract v1; không gọi DB/service.");
