/**
 * Thuật toán bậc thang từ learn_sqlize: phân bổ bậc lớn trước, không tối ưu số quà.
 * Giữ chế độ prorated của code gốc nhưng KHÔNG tự áp dụng vào kết luận hóa đơn.
 * Caller phải chọn chính sách sau khi nghiệp vụ được xác nhận.
 */
export function calculatePromotion(quantity, rules, { remainder = "prorated" } = {}) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Array.isArray(rules) || !rules.length ||
        !["prorated", "none"].includes(remainder)) throw new Error("Dữ liệu khuyến mãi không hợp lệ.");
    const normalized = rules.map(rule => ({ buy: rule.buy ?? rule.buyQuantity, present: rule.present ?? rule.giftQuantity }));
    for (const { buy, present } of normalized) {
        if (!Number.isSafeInteger(buy) || buy <= 0 || !Number.isSafeInteger(present) || present < 0) {
            throw new Error("Bậc khuyến mãi không hợp lệ.");
        }
    }
    if (new Set(normalized.map(row => row.buy)).size !== normalized.length) throw new Error("Trùng bậc khuyến mãi.");
    normalized.sort((a, b) => b.buy - a.buy);
    let remaining = BigInt(quantity);
    let gifts = 0n;
    for (const { buy, present } of normalized) {
        const count = remaining / BigInt(buy);
        gifts += count * BigInt(present);
        remaining %= BigInt(buy);
    }
    const smallest = normalized.at(-1);
    if (remainder === "prorated") gifts += remaining * BigInt(smallest.present) / BigInt(smallest.buy);
    if (gifts > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Số quà vượt giới hạn an toàn.");
    return Number(gifts);
}
