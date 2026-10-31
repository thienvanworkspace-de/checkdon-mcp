# Ranh giới nghiệp vụ và hướng mở rộng

## Hiện tại: tất cả nghiệp vụ vẫn là Node.js

Check đơn/Postđơn hiện chạy Node.js trong một ứng dụng, chưa có service Java/C# hoặc cụm microservices. Mục tiêu trước mắt là hoàn thiện hai chức năng này. Những adapter khác chỉ là điểm mở rộng được kiểm thử, không bật trong cấu hình mặc định.

Node phù hợp I/O và những phép kiểm tra hiện tại. Nếu sau này xuất hiện tính toán CPU nặng hoặc nghiệp vụ hệ thống khác, có thể chuyển từng use case mà không thay transport. Chưa quyết định dùng Java hay C# cho phần nào.

```text
MCP / Telegram
      ↓
Application Service (điều phối, context, lấy dữ liệu RAM)
      ↓
BusinessGateway — hợp đồng request/response JSON v1
      ↓
BusinessExecutorFactory
      ├── NodeBusinessExecutor → UseCaseFactory → lớp use case → lớp business → repository
      ├── StoredProcedureExecutor → CALL procedure(JSON)
      └── HttpBusinessExecutor → endpoint nội bộ tương lai
```

Factory chỉ chọn implementation; không chứa luật nghiệp vụ. Các đăng ký nằm trong Awilix tại composition root. Không inject container/service locator vào business hay repository.

## Mỗi model một lớp/file

```text
src/models/
├── customer.js                # class Customer
├── customer-feature.js        # class CustomerFeature
├── product.js                 # class Product
├── specific-price.js
├── specific-promotion.js
├── program-promotion.js
├── product-lot.js
├── hospital-price.js
├── accountant.js
├── order.js                   # class Order
├── order-ok.js                # class OrderOk
├── order-record.js            # thuộc tính chung cho orders/orders_ok
├── order-projection.js
├── sync-cursor.js
├── application-model.js       # binding/metadata dùng chung
├── fields.js
├── associations.js
└── model-types.js             # registry lớp
```

Model Factory trong infrastructure chỉ khởi tạo registry và nối quan hệ. Lớp export chưa bind connection toàn cục. `Customer.initialize(sequelize)` trả một lớp con đã bind; instance vẫn là `instanceof Customer`. Repositories dùng `models.Customer` do Awilix truyền vào, không import connection toàn cục rồi gọi trực tiếp trên lớp chưa init.

Mỗi container/connection có binding riêng để việc tạo một context mới không làm model cũ trỏ sang pool khác. Schema SQL trước và sau lần tách lớp được đối chiếu và giữ nguyên.

Thêm model: tạo file lớp, thêm vào registry và khai báo quan hệ nếu cần. Thay schema vẫn cần migration riêng; factory không tự sửa bảng.

## Các lớp application và business

- `src/application/services/`: facade cho transport, chọn snapshot và chuẩn hóa DTO.
- `src/application/use-cases/`: mỗi chức năng một lớp, ví dụ CheckOrder, CheckInvoice, CreateOrder, UpdateOrderContent.
- `src/business/`: luật nghiệp vụ hiện tại. InvoiceService nhận snapshot đã chuẩn bị, không biết HTTP, cache, Sequelize hay cách gọi stored procedure.
- `src/application/ports/`: hợp đồng adapter thực thi.
- `src/infrastructure/business/`: implementation Node/procedure/HTTP.

Sheet sync/cache/outbox vẫn được Node điều phối như trước. Gateway hiện bao phủ các chức năng tạo/sửa đơn và kiểm tra đơn/hóa đơn; không ép tất cả tác vụ hạ tầng phải đi qua remote call.

## Hợp đồng độc lập ngôn ngữ

Nguồn schema: `src/application/contracts/business-contract.js`.

Artifact JSON Schema Draft 2020-12 cho công cụ Java/C# hoặc kiểm thử hợp đồng:

- `contracts/business/v1/request.schema.json`
- `contracts/business/v1/response.schema.json`

Sinh lại bằng `npm run contracts:export` khi thay nguồn. Thay đổi phá tương thích cần phiên bản contract mới, không thay nghĩa âm thầm dưới version 1.0.

Request envelope có `contractVersion`, `requestId`, `operation`, `context`, `payload`. Response có cùng version/requestId/operation và một trong hai dạng:

```json
{
  "contractVersion": "1.0",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "operation": "orders.create",
  "success": true,
  "data": { "created": true, "key": "-123:456" }
}
```

```json
{
  "contractVersion": "1.0",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "operation": "orders.create",
  "success": false,
  "error": { "code": "BUSINESS_UNAVAILABLE", "message": "Nghiệp vụ chưa sẵn sàng", "retryable": true }
}
```

Gateway kiểm tra cả schema lẫn correlation ID/operation. Response sai hợp đồng bị từ chối; không fallback sang engine khác rồi có nguy cơ thực hiện lệnh ghi hai lần.

DTO không chứa Model, function, Map, Date hoặc Decimal instance. Các giá trị decimal trong đơn/hóa đơn và danh mục tham chiếu là **chuỗi thập phân**; ID/count/flag giữ kiểu tương ứng. Không ép Java BigDecimal/C# decimal qua double. Không làm tròn ngầm trong mapper.

Kiểm tra đơn/hóa đơn nhận danh mục liên quan lấy từ một snapshot RAM: chỉ khách, sản phẩm và chính sách có liên quan, không gửi toàn bộ cache hay `sourceData`. Vì có dữ liệu tham chiếu trong request, engine mới không bắt buộc phải query lại DB cho lời gọi kiểm tra. Mặc định Node vẫn kiểm tra hoàn toàn trên RAM.

HTTP middleware chuyển subject đã xác thực qua RequestContext; không forward bearer token người dùng tới engine. Server Java/C# tương lai phải xác thực service Node riêng và chỉ tin context từ nguồn đã được xác thực đó.

## Cấu hình mở rộng — chưa cần dùng trong luồng hiện tại

Bỏ trống `BUSINESS_ROUTES` nghĩa là **tất cả chạy Node**. Chọn backend là quyết định của cấu hình server, không nhận từ request/GPT/Sheet. Hiện không cấu hình operation nào sang procedure/HTTP.

Khi thực sự cần, từng operation có thể được cấu hình bằng `node`, `procedure`, `http`. Danh sách operation hiện có:

- `orders.create`
- `orders.updateContent`
- `orders.check`
- `invoices.check`

### Stored procedure

Adapter chỉ nhận tên procedure trong allowlist `BUSINESS_PROCEDURES`, không nhận SQL từ client. Gọi `CALL procedure(:request)` với tham số JSON đã bind, không nối payload vào SQL. Procedure phải trả đúng một dòng với cột `response` chứa response envelope JSON.

Procedure thực hiện lệnh ghi phải sở hữu transaction, giữ quy tắc archive/tombstone/idempotency và ghi outbox cùng transaction như Node implementation. Không bọc thêm transaction Node bên ngoài một procedure tự quản transaction. Không có procedure nghiệp vụ mới nào được tạo trong schema ứng dụng ở bước này; procedure trong integration test chỉ thuộc container kiểm thử dùng một lần.

Chọn operation kiểm tra sang procedure sẽ có một lượt gọi DB, khác luồng mặc định dùng RAM. Vì vậy không chuyển chỉ để “đủ pattern”; chỉ làm khi chức năng cụ thể cần.

### Service Java/C# tương lai

`BUSINESS_SERVICE_URL` là endpoint execute đầy đủ, ví dụ `/v1/business/execute`. Dùng HTTPS và service credential `BUSINESS_SERVICE_TOKEN`; HTTP chỉ được chấp nhận cho loopback kiểm thử. Adapter có timeout, từ chối redirect, không tự retry lệnh ghi và không lộ token/upstream body trong lỗi.

Endpoint này chưa được triển khai bằng Java/C#. Trong test, một peer Node cục bộ dùng cùng contract mô phỏng ranh giới giao tiếp. Khi mở rộng thật, service nhận request version 1.0, thực hiện use case và trả envelope tương ứng; transport MCP/Telegram không phải đổi.

Lệnh ghi remote cần idempotency ở service nhận, theo requestId và khóa nghiệp vụ. Nếu retry một envelope, giữ requestId đó; gọi application service lần mới hiện tạo requestId mới. Không xem timeout HTTP là bằng chứng transaction chưa commit. Không chia một transaction giữa Node và Java/C#; dùng transaction/outbox trong service sở hữu dữ liệu và đồng bộ cache có chủ đích.

## Thêm chức năng sau này

1. Khai báo input/output DTO và operation có tên rõ ràng.
2. Tạo một use case riêng và lớp business cần thiết.
3. Đăng ký lớp/use case trong `src/application/register-business.js` qua Awilix.
4. Transport chỉ gọi application facade tương ứng; không gọi SQL/service ngoài trực tiếp.
5. Chạy cùng bộ contract tests cho implementation cần dùng. Chỉ bật backend khác sau khi nghiệp vụ đó có nhu cầu và đã kiểm thử.

Thuật toán khuyến mãi, quy tắc đồng bộ/archive, plugin Check đơn và các thứ tự ưu tiên nghiệp vụ chưa chốt giữ nguyên phạm vi như trước.
