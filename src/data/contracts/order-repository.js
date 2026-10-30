/**
 * Hợp đồng lưu trữ đơn hàng, dùng chung cho Sheets và MySQL/Sequelize sau này.
 * Repository chịu trách nhiệm chống trùng và giữ nguyên các trường không cập nhật.
 * Adapter MySQL cần UNIQUE(key) và INSERT/UPDATE nguyên tử, không dò số dòng Sheet.
 */
export class OrderRepository {
    /** @returns {Promise<{created: boolean, key: string, reason?: string}>} */
    async createIfAbsent(order) {
        throw new Error("OrderRepository.createIfAbsent chưa được triển khai.");
    }

    /** Không tự tạo đơn mới khi không tìm thấy key. */
    async updateContent(key, content) {
        throw new Error("OrderRepository.updateContent chưa được triển khai.");
    }
}
