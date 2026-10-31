/** Tích hợp parser từ learn_sqlize; đầu ra giữ tên buy/present của model Sequelize. */
export function promotionPolicyParse(policyText) {
    if (typeof policyText !== "string") throw new Error("Chính sách khuyến mãi phải là chuỗi.");
    return [...policyText.matchAll(/mua\s+(\d+)\s+tặng\s+(\d+)/gi)].map(match => {
        const buy = Number(match[1]);
        const present = Number(match[2]);
        if (!Number.isSafeInteger(buy) || buy <= 0 || !Number.isSafeInteger(present)) {
            throw new Error("Bậc khuyến mãi không hợp lệ.");
        }
        return { buy, present };
    });
}
