# CheckDon MCP và service Postdon

Ứng dụng Node.js ES Modules có hai nhiệm vụ độc lập:

- **MCP:** xác thực OAuth/AuthKit, cung cấp `hello_checkdon` và `check_invoice`.
- **Postdon:** nhận tin nhắn mới/chỉnh sửa từ nhóm Telegram và lưu nội dung đơn vào Google Sheets.

`check_invoice` vẫn trả `DEMO_ONLY`: chưa có quy tắc đối chiếu giá/chiết khấu/khuyến mãi. Việc tích hợp Postdon không biến các lỗi mẫu thành kết luận nghiệp vụ thật.

## Kiến trúc

```text
Telegram API → TelegramPoller → OrderUpdateHandler
                                      ↓
                                 OrderService       ← business
                                      ↓
                                OrderRepository     ← hợp đồng dữ liệu
                                      ↓
                             OrderSheetRepository   ← ánh xạ dữ liệu
                                      ↓
                              GoogleSheetsGateway   ← I/O Google API

HTTP /mcp → OAuth middleware → MCP handler → InvoiceService
```

Business chỉ nhận repository được truyền vào constructor; không tự đọc biến môi trường, tạo client Google hay viết SQL. `src/container.js` là nơi lắp ghép các dependency, thay cho container Awilix của Postdon cũ.

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `server.js` | Entry point chỉ chạy MCP. |
| `scripts/start-postdon.js` | Entry point worker Telegram độc lập. |
| `scripts/start-all.js` | Chạy cả HTTP/MCP và Telegram trong một process. |
| `src/config/` | Đọc và kiểm tra cấu hình. |
| `src/runtime.js` | Khởi động, dừng HTTP và polling; xử lý SIGINT/SIGTERM. |
| `src/container.js` | Lắp ghép services, repositories và adapters. |
| `src/business/` | Nghiệp vụ nhận/sửa đơn, danh mục, hóa đơn. |
| `src/data/contracts/` | Hợp đồng repository để đổi nguồn dữ liệu sau này. |
| `src/data/google-sheets/` | Ánh xạ đơn hàng/danh mục sang các cột Sheet. |
| `src/infrastructure/google-sheets/` | Gọi Google API; hàng đợi ghi dùng chung trong một process. |
| `src/infrastructure/telegram/` | HTTP client và vòng long polling có retry/timeout. |
| `src/transports/telegram/` | Lọc nhóm/người gửi; chuyển update thành lời gọi business. |
| `src/mcp/` | Định nghĩa schema đầu vào và tools MCP. |
| `src/http/` | Express app và middleware xác thực. |
| `tests/` | Kiểm thử offline bằng fake API và identity provider cục bộ. |
| `test-mcp.js` | Client thử thủ công với server triển khai; cần OAuth, không nằm trong `npm test`. |

## Cài đặt và chạy

Yêu cầu Node.js **>=24.5** và npm. Các lệnh chạy có `--use-env-proxy` để dùng proxy do môi trường cung cấp; giữ nguyên cấu hình proxy/CA và xác minh TLS.

```bash
npm ci
npm test
npm start                 # Chỉ MCP, không cần Google/Telegram
npm run start:postdon     # Chỉ worker Telegram
npm run start:all         # Cả hai nhiệm vụ
```

Thực hiện trong thư mục repository. Các lệnh start đọc `.env` nếu tồn tại bằng chức năng sẵn có của Node; biến đã có trong môi trường được ưu tiên. Không cần `dotenv` hoặc SDK Telegram. Có thể sao chép `.env.example` thành `.env`, rồi điền cấu hình qua môi trường bảo mật. Không commit khóa hoặc token.

Không chạy `start:all` cùng một `start:postdon` khác với cùng bot. Mỗi token chỉ có một worker long polling. Khi chuyển từ Postdon cũ, cần dừng worker cũ trước khi bật worker mới. Bot đang có webhook cũng không thể chạy long polling đồng thời; cấu hình chuyển chế độ phải được thực hiện có chủ đích, ứng dụng không tự xóa webhook.

### Cấu hình MCP

| Biến | Ý nghĩa |
| --- | --- |
| `PORT` | Cổng HTTP, mặc định 3000. |
| `AUTHKIT_ISSUER` | AuthKit issuer; mặc định giữ staging issuer của dự án cũ. |
| `MCP_RESOURCE_URL` | URL tài nguyên MCP và audience được chấp nhận trong JWT. Cần khớp URL thực tế khi triển khai. |
| `ALLOWED_HOSTS` | Tùy chọn, danh sách hostname được phép, phân cách bằng dấu phẩy. |

Các route giữ nguyên: `GET /health`, `GET /.well-known/oauth-protected-resource`, `/mcp`.

Middleware kiểm tra chữ ký JWT qua JWKS, issuer, audience, subject, rồi lấy email đã xác minh từ AuthKit UserInfo và kiểm tra danh sách email được phép. Danh sách email hiện ở `src/config/index.js`. Metadata scopes chưa thay thế cho cơ chế kiểm tra quyền nghiệp vụ. `/health` chỉ kiểm tra HTTP/MCP, không khẳng định Telegram hoặc Google Sheets đang kết nối thành công.

### Cấu hình Postdon

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Có | Token của bot nhận update. |
| `CHECKDON_WORKBOOK_ID` | Có | ID spreadsheet. |
| `GOOGLE_CLIENT_EMAIL` | Có | Email Google service account. |
| `GOOGLE_PRIVATE_KEY` | Có | Private key của service account; hỗ trợ chuỗi có `\n`. |
| `ORDER_SHEET_NAME` | Không | Tab đơn hàng, mặc định `Đơn Hàng`. |
| `PRODUCT_SHEET_NAME` | Không | Tab sản phẩm, mặc định `Sản Phẩm`. |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Không | Danh sách chat ID phân cách bằng dấu phẩy. Trống nghĩa là nhận mọi nhóm bot được phép đọc, giống Postdon cũ. |

Cần bật Google Sheets API và chia sẻ spreadsheet với service account có quyền sửa. Bot cần được thêm vào nhóm và có cấu hình quyền/privacy phù hợp để nhận tin cần xử lý. Không có bước đăng nhập, tạo bot, thay quyền hay chia sẻ Sheet tự động.

Đích mạng cần cho Postdon: `api.telegram.org`, `oauth2.googleapis.com`, `sheets.googleapis.com`. MCP dùng hostname trong `AUTHKIT_ISSUER`. Nếu cloud chặn egress, thêm đúng các domain này vào cấu hình mạng. Google private key cần được SDK dùng tại process để ký JWT; không dùng proxy placeholder thay cho nội dung khóa ký. Ưu tiên secret manager hoặc biến môi trường bảo mật, không truyền key qua chat/log.

### Hành vi nhận đơn và layout dữ liệu

Giữ các quy tắc của mã Postdon được cung cấp:

- Chỉ xử lý `message` và `edited_message` trong `group`/`supergroup`, từ người gửi không phải bot.
- Nội dung lấy từ `text`, nếu không có thì lấy `caption`. Không đọc ảnh/OCR hoặc tự phân tích sản phẩm.
- Mỗi tin không rỗng được coi là một đơn; chưa có bộ phân loại tin nhắn là đơn hàng.
- Key là `chatId:messageId`.
- Tin mới ghi sau dòng cuối có dữ liệu trong A:G. Dòng 1 dành cho tiêu đề; không tự tạo tab hoặc tiêu đề.
- Tin chỉnh sửa chỉ cập nhật ô C theo key. Không tìm thấy key thì trả `ORDER_NOT_FOUND`, không tạo thêm đơn.
- `ProductService.getProducts()` giữ dữ liệu thô từ `Sản Phẩm!A:F`, gồm tiêu đề. Chưa gán ý nghĩa cho từng cột khi chưa có schema chính thức.

| Cột tab đơn hàng | Dữ liệu khi tạo |
| --- | --- |
| A | Key Telegram |
| B | Trống |
| C | Nội dung tin nhắn |
| D | Trống |
| E | Thời điểm nhận theo `Asia/Ho_Chi_Minh`, dạng `YYYY-MM-DD HH:mm:ss` |
| F, G | Trống |

Các cải tiến so với mã được cung cấp:

- Kiểm tra trùng key trước khi tạo, tránh ghi trùng khi Telegram gửi lại update; tin mới gửi lại không ghi đè nội dung đã sửa.
- Bao cả bước tìm và ghi trong cùng hàng đợi để tránh race trong một process.
- Phát hiện key trùng có sẵn và báo lỗi, không sửa bừa một dòng.
- Ghi `RAW` để giữ nguyên nội dung; khác mã cũ dùng `USER_ENTERED`, chuỗi bắt đầu bằng `=` sẽ không chạy như công thức.
- Lỗi ghi không làm hỏng hàng đợi; worker chỉ tăng offset sau khi xử lý thành công, thử lại khi lỗi tạm thời.
- Không monkey-patch `console` hay ghi log đồng bộ như logger cũ. Log vận hành ra stdout/stderr để supervisor thu thập; không ghi nội dung đơn, email người dùng hoặc token vào log của worker.

### Giới hạn vận hành cần biết

Hàng đợi chỉ có hiệu lực trong một process. Google Sheets không có transaction/unique constraint: chạy một writer cho workbook này, tránh chèn/xóa/dịch hàng bằng tay trong lúc worker tìm và cập nhật. Nhiều instance hoặc writer bên ngoài vẫn có thể gây race. Bước tạo đơn phải đọc vùng dữ liệu nên chưa phù hợp cho Sheet quá lớn.

Offset Telegram hiện ở bộ nhớ. Khi restart, Telegram có thể gửi lại update chưa được xác nhận; tạo đơn đã có key sẽ được bỏ qua, sửa đơn ghi lại nội dung tương ứng. Telegram chỉ lưu update trong thời gian hữu hạn; đây chưa phải hàng đợi bền vững cho gián đoạn dài ngày. Một update liên tục ghi lỗi sẽ chặn các update phía sau để không âm thầm bỏ đơn; log cảnh báo chứa offset cần điều tra. Chưa có dead-letter queue.

Worker tôn trọng `retry_after` (giới hạn chờ tối đa 300 giây). Telegram trả 401/403/409 thì worker thoát với mã lỗi để supervisor/cấu hình xử lý. Khi SIGINT/SIGTERM, worker hủy long polling và chờ thao tác ghi hiện tại kết thúc; thời gian dừng còn phụ thuộc timeout Google API. Trong chế độ `start:all`, lỗi polling nghiêm trọng cũng dừng HTTP; dùng hai process riêng nếu cần cách ly sự cố.

## Mở rộng MySQL bằng Sequelize

Chưa thêm dependency MySQL, kết nối CSDL, `sync()` hay migration ở bước này. Chọn phiên bản Sequelize và schema trước khi viết adapter.

1. Tạo `src/data/mysql/order-mysql-repository.js` thực hiện cùng hợp đồng `OrderRepository`: `createIfAbsent({key, content, createdAt})` và `updateContent(key, content)`.
2. Tạo adapter danh mục theo hợp đồng `ProductRepository`. Khi chuẩn hóa model sản phẩm, cập nhật cả adapter Sheet và MySQL để trả cùng kiểu dữ liệu.
3. Tạo Sequelize instance/pool tại tầng infrastructure, truyền models vào repository. Bổ sung unique constraint cho key và thao tác tạo nguyên tử; không dùng cách tìm số dòng của Sheet.
4. Chọn adapter tại `src/container.js`. `OrderService` và Telegram handler không cần biết đang dùng Sheet hay MySQL. Nếu cần ghi cả hai, thiết kế nguồn chính và cơ chế đồng bộ/outbox rõ ràng, tránh coi hai lần ghi là một transaction.
5. Migration chỉ chạy riêng khi schema được phê duyệt; không tự `sync({ alter: true })` lúc khởi động. Dùng `DECIMAL` và quy tắc làm tròn rõ ràng cho tiền khi phát triển nghiệp vụ hóa đơn.
6. Bổ sung integration test với database dành riêng cho kiểm thử; không dùng database sản xuất để chạy test.

## Kiểm thử

`npm test` dùng Node test runner, không dùng token thật và không gọi Telegram/Google/AuthKit thật. Test đi qua business, repository và gateway với fake Google API có trạng thái; kiểm tra polling retry/offset, lọc tin và bảo vệ nội dung. Test MCP dùng identity provider cục bộ với khóa ký sinh trong bộ nhớ để kiểm tra JWT/OAuth, handshake, tools và validation đầu vào.

Tests HTTP cần được phép bind cổng loopback. Trong cloud có command sandbox chặn cả loopback, chạy bằng cơ chế network-enabled được nền tảng hỗ trợ. `test-mcp.js` là client thủ công tới URL triển khai cũ và chưa có luồng đăng nhập; không dùng nó làm bằng chứng `npm test` đã gọi service thật.
