/** Xóa dòng Sheet chỉ là yêu cầu đối soát; Node tự đọc danh sách key hiện tại. */
export class OrderReconciliationService {
    constructor({ orderRepository, orderSheetRepositoryFactory, clock = () => new Date() }) {
        this.orders = orderRepository;
        this.sheetFactory = orderSheetRepositoryFactory;
        this.clock = clock;
    }
    async reconcile() {
        const cutoff = this.clock();
        const sheet = await this.sheetFactory();
        const presentKeys = await sheet.listKeys(); // Thiếu header/key hoặc không đọc được => không archive.
        return { ...await this.orders.archiveMissingOrders(presentKeys, cutoff), catalogChanged: false };
    }
}
