import { Transaction } from "sequelize";

export const catalogModels = {
    customers: "Customer", products: "Product", accountants: "Accountant",
    customerFeatures: "CustomerFeature", specificPrices: "SpecificPrice",
    specificPromotions: "SpecificPromotion", programPromotions: "ProgramPromotion", productLots: "ProductLot", hospitalPrices: "HospitalPrice"
};

/** Đọc toàn bộ danh mục trong một snapshot nhất quán, không JOIN gây lặp dòng. */
export class CatalogRepository {
    constructor({ sequelize, models }) { this.sequelize = sequelize; this.models = models; }

    loadAll() {
        return this.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async transaction => {
            const result = {};
            for (const [entity, model] of Object.entries(catalogModels)) {
                result[entity] = await this.models[model].findAll({ raw: true, transaction });
            }
            return result;
        });
    }
}
