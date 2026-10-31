/** Quan hệ được nối sau khi toàn bộ lớp đã bind vào cùng connection. */
export function configureAssociations(models) {
    const { Customer, CustomerFeature, Product, SpecificPrice, SpecificPromotion, HospitalPrice, ProductLot, ProgramPromotion } = models;
    Customer.hasOne(CustomerFeature, { foreignKey: "customerId", as: "features" });
    CustomerFeature.belongsTo(Customer, { foreignKey: "customerId" });
    for (const ModelType of [SpecificPrice, SpecificPromotion, HospitalPrice]) {
        ModelType.belongsTo(Customer, { foreignKey: "customerId" });
        ModelType.belongsTo(Product, { foreignKey: "productId" });
    }
    ProductLot.belongsTo(Product, { foreignKey: "productId" });
    ProgramPromotion.belongsTo(Product, { foreignKey: "productId" });
}
