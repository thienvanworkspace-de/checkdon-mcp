/** Điểm mở rộng để thêm quy tắc danh mục, không đưa chi tiết Sheet vào business. */
export class ProductService {
    constructor({ productRepository }) {
        this.products = productRepository;
    }

    getProducts() {
        return this.products.getProducts();
    }
}
