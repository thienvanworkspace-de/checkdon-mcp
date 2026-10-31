import { modelTypes } from "../../models/model-types.js";
import { configureAssociations } from "../../models/associations.js";

/** Chỉ khởi tạo các lớp và nối quan hệ; mỗi model có file riêng trong src/models. */
export function createModels(sequelize) {
    const models = Object.fromEntries(modelTypes.map(ModelType => [ModelType.name, ModelType.initialize(sequelize)]));
    configureAssociations(models);
    return models;
}
