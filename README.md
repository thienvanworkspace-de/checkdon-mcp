# CheckDon MCP / Postdon

Node.js ES Modules, MySQL 8 + Sequelize 6, Awilix DI và cache danh mục trong RAM.

**MySQL là nguồn lưu trữ chính.** Sheet là giao diện nhập liệu/bản theo dõi. Plugin Check đơn đang sử dụng không bị sửa hay thay thế bởi repository này.

```text
Apps Script → HMAC webhook → Sync Business → MySQL transaction → patch cache RAM
Telegram → Order Business → orders + outbox → worker chiếu đơn lên Sheet
MCP → OAuth/AuthKit → InvoiceService → snapshot RAM (không query MySQL)
Xóa dòng đơn → đối soát Sheet → transaction: orders → orders_ok
```

Thiết kế trong code `learn_sqlize` là nền của models. Các Sheet đang thay đổi được ánh xạ tại adapter/Apps Script, không dùng cấu trúc Sheet cũ để ép lại schema nghiệp vụ.

## Cấu trúc

| Đường dẫn | Vai trò |
| --- | --- |
| `src/container.js` | Composition root Awilix, singleton, dependency injection và dispose pool. |
| `src/infrastructure/mysql/` | Connection Factory, Model Factory và transaction retry khi deadlock. |
| `src/data/mysql/` | Repositories cho danh mục, đồng bộ và đơn hàng. |
| `src/cache/` | Full load khi khởi động/recovery; patch sau commit, công bố snapshot bất biến. |
| `src/business/` | Nghiệp vụ đơn, hóa đơn, đồng bộ và thuật toán khuyến mãi. |
| `src/data/google-sheets/` | Bản chiếu đơn và Layout Factory cho Sheet cũ/mới. |
| `src/http/` | OAuth middleware, HTTP app và HMAC webhook. |
| `src/mcp/` | Schemas và tools `hello_checkdon`, `check_order`, `check_invoice`. |
| `src/infrastructure/telegram/` | Bot API client và long polling có retry/offset. |
| `src/infrastructure/projection/` | Worker outbox MySQL → Sheet. |
| `apps-script/Code.gs` | Installable triggers, mapping Sheet, hàng đợi bền vững, ký webhook. |
| `migrations/001-initial.sql` | SQL sinh từ models để review cho database MỚI; không tự chạy. |
| `tests/` | Unit/HTTP tests và integration tests riêng với MySQL container local. |

Chi tiết hợp đồng dữ liệu, thiết lập Apps Script và giới hạn đồng bộ: [docs/mysql-sync.md](docs/mysql-sync.md).

## Chạy ứng dụng

Yêu cầu Node.js >=24.5 và MySQL 8. `npm start` mặc định yêu cầu MySQL thật đã được cấu hình và có schema.

```bash
npm ci
npm test
npm start                 # HTTP/MCP, webhook, cache danh mục
npm run start:postdon     # Worker Telegram + chiếu đơn ra Sheet
npm run start:all         # Một process chạy cả HTTP/webhook và các worker
```

Các script đọc `.env` nếu có và dùng proxy do môi trường cung cấp. Không commit `.env`, khóa Google, mật khẩu MySQL hay shared secret. Xem `.env.example`.

Runtime **không chạy migration hay sequelize.sync()**. Nó authenticate MySQL, tải toàn bộ danh mục trong transaction nhất quán rồi mới mở HTTP. `/health` kiểm tra HTTP; `/ready` kiểm tra trạng thái cache. Thiếu cấu hình, schema hoặc MySQL không sẵn sàng thì khởi động thất bại, không âm thầm chuyển sang Sheet.

`DATA_PROVIDER=memory npm start` chỉ là chế độ test/demo rõ ràng, cache rỗng, không đồng bộ/ghi dữ liệu sản xuất. Chế độ này không phải fallback khi MySQL lỗi và không chạy worker Postdon.

### Khởi tạo schema

Review `migrations/001-initial.sql` trước khi áp dụng lên database mới qua công cụ quản trị của bạn. Đây là schema ban đầu, không phải migration nâng cấp cho database `learn_sqlize` đã tồn tại. Các bảng cũ có thể có tên/casing khác; cần đối chiếu riêng trước khi chuyển dữ liệu.

```bash
npm run db:schema  # Chỉ sinh lại file SQL từ metadata, không kết nối DB
```

## Nghiệp vụ đã có và phần để chốt sau

- Thuật toán khuyến mãi giữ đúng code đính kèm: phân bổ bậc lớn trước, phần dư tính theo tỷ lệ bậc nhỏ nhất rồi làm tròn xuống. Ví dụ mua 5 với bậc mua 10 tặng 2 được tặng 1.
- Chưa tự chọn ưu tiên giữa giá sản phẩm, giá riêng, giá bệnh viện, chiết khấu và các nguồn khuyến mãi. Chúng được đưa vào dữ liệu tham chiếu; kết quả có `POLICY_CONFIRMATION_REQUIRED` và `requires_review` khi cần quyết định.
- MCP kiểm tra sự tồn tại/trạng thái khách–sản phẩm, số lượng, giá cơ bản khi không vướng chính sách, đối chiếu đơn–hóa đơn và số học bằng Decimal. Đây chưa phải kết luận đầy đủ “hóa đơn hợp lệ”.
- Dữ liệu lô/hạn dùng được nạp vào RAM; chưa suy đoán hạn dùng khi nguồn chỉ ghi tháng/năm, chưa áp quy tắc thuế/làm tròn hoặc hạn mức bệnh viện.
- `orders_ok` và `orders` dùng cùng factory thuộc tính. Xóa đơn đang theo dõi nghĩa là chuyển nguyên bản sang `orders_ok` trong transaction; không làm mất nội dung và thông tin kế toán. Replay Telegram không tự khôi phục đơn đã chuyển.

## Kiểm thử

```bash
npm test
```

Không dùng credentials thật; HTTP/OAuth dùng identity provider cục bộ, Telegram và Google Sheets dùng fake. Các test kiểm tra mapping Sheet cũ → model mới, cache immutable, không query DB trong tool, thuật toán khuyến mãi, startup/shutdown và hồi quy MCP.

Kiểm thử MySQL thật chỉ thực hiện trong **container local dùng một lần**, không dùng `DB_*` và không đọc `.env`:

```bash
docker run --rm -d --name checkdon-mysql-test \
  -e MYSQL_ROOT_PASSWORD=local-test-only -e MYSQL_DATABASE=checkdon_test \
  -p 127.0.0.1:33077:3306 mysql:8.4
TEST_MYSQL_PORT=33077 npm run test:mysql
docker rm -f checkdon-mysql-test
```

`test:mysql` xóa/tạo lại các bảng trong `checkdon_test` của container. Test dùng đúng SQL ban đầu, unique/FK, transaction rollback, cập nhật cache, HMAC, outbox và archive. Không dùng lệnh này với database chứa dữ liệu cần giữ. Đích MySQL của test cố định là loopback, database/user/password test cố định; chỉ cổng là tham số.

`test-mcp.js` vẫn là client thủ công tới server triển khai cũ, chưa có luồng đăng nhập. Nó không thuộc `npm test`.
