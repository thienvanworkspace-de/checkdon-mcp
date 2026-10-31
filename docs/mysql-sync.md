# MySQL, cache và đồng bộ Sheet

## Nguyên tắc và phạm vi

- MySQL giữ toàn bộ dữ liệu nghiệp vụ. Sheet là giao diện làm việc, không là database chính.
- Model lấy từ `learn_sqlize`: Customer, CustomerFeature, Product, SpecificPrice, SpecificPromotion, ProgramPromotion và Accountant. Tên bảng SQL được khai báo rõ, không dựa vào suy đoán pluralization.
- Bổ sung dữ liệu lô/hạn dùng, giá bệnh viện, đơn, đơn ok, transactional outbox và cursor chống lặp.
- `sourceData` JSON giữ dữ liệu cột gốc khi Sheet còn thay đổi. Thêm cột nghiệp vụ quan trọng vẫn cần bổ sung mapping/model/migration có chủ đích; không tự sinh schema từ bất kỳ header nào.
- Hiện triển khai một HTTP service sở hữu cache và một writer chiếu Sheet. Có thể chạy chung bằng `start:all`. Nhiều HTTP replica cần thêm invalidation bus (Redis/pub/sub); thay đổi trực tiếp bằng SQL ngoài ứng dụng cần thông báo hoặc restart/reload, không tự hiện vào RAM.

## Danh mục và cache

Khi startup, repository nạp khách, features, sản phẩm, giá riêng, KM riêng, chương trình KM, lô/hạn dùng, giá bệnh viện và kế toán trong một transaction REPEATABLE READ. Cache tạo index khách/sản phẩm và snapshot bất biến; timestamp được đổi thành chuỗi để caller không mutate Date.

Khi Apps Script gửi edit:

1. Webhook kiểm tra HMAC và timestamp, parse canonical schema, kiểm tra workbook.
2. Repository khóa cursor theo **workbook + entity + natural key**; version cũ/trùng không được ghi đè bản mới. Version các dòng độc lập, không dùng một watermark chung làm rơi thay đổi của dòng khác.
3. Trong cùng transaction, resolve mã KH/SP thành FK, upsert dữ liệu, lưu version và hash. Khi cập nhật khách, features đi cùng transaction.
4. Sau commit, patch các bản ghi đã lưu vào snapshot RAM. Không full-load database sau mỗi edit.
5. Chỉ ACK khi cache đã phản ánh commit. Nếu cache lỗi, đánh dấu không ready; Apps Script retry cùng event sẽ full-refresh từ DB để phục hồi dù transaction trước đã commit.

Mỗi lời gọi MCP giữ một snapshot nhất quán và không truy vấn MySQL. Đơn hàng không cần đưa vào cache danh mục ở bước này.

## Endpoint và hợp đồng

`POST /integrations/sheets/events`, HTTPS ở môi trường triển khai.

```json
{
  "timestamp": 1793400000000,
  "payload": "{\"eventId\":\"uuid\",\"spreadsheetId\":\"book\",\"entity\":\"customers\",\"version\":1,\"row\":{\"code\":\"KH1\",\"name\":\"Khách\"}}",
  "signature": "hex-HMAC-SHA256"
}
```

Ký chính xác `timestamp + "." + payload` bằng `SHEET_SYNC_SECRET`. Timestamp tính bằng milliseconds, lệch tối đa 5 phút; retry ký lại envelope nhưng giữ nguyên payload/version. Không đưa secret vào code, log hoặc Sheet. So chữ ký bằng constant-time comparison.

Row là snapshot của một bản ghi, không phải SQL hay một object Sequelize tùy ý. Không nhận `customerId`/`productId` từ Sheet để mass-assign; nhận mã nghiệp vụ rồi resolve FK trong transaction. Trường lạ bị chặn, ngoại trừ dữ liệu gốc trong `sourceData`.

| Entity | Khóa và dữ liệu canonical chính |
| --- | --- |
| customers | `code`, `name`, `address`, `province`, `category` (integer), `hasFeatures`, `isActive`; tùy chọn `features` gồm `isPromoted`, tên/địa chỉ PXK. |
| products | `code`, `name`, `unit`, `unitPrice`, `discountRate`, `promotionPolicy`, `isActive`. |
| specificPrices | `customerCode`, `productCode`, `unitPrice`, `discountRate`, `promotionPolicy`, `isActive`. |
| specificPromotions | `customerCode`, `productCode`, `buy`, `present`, `isActive`. |
| programPromotions | `sourceKey`, `productCode` (nullable cho chương trình toàn bộ), `promotionPolicy`, `fromDate`, `toDate`, `buy`, `present`, `isActive`. |
| productLots | `productCode`, `lotNumber`, `expiryDate` (chuỗi giữ độ chính xác gốc), `isActive`. |
| hospitalPrices | `customerCode`, `productCode`, `unitPrice`, `discountRate`, `soldQuantity`, `isActive`. |
| customerFeatures | `customerCode`, `isPromoted`, `nameOnGoodsIssueInvoice`, `addressOnGoodsIssueInvoice`. |
| accountants | `email`, `name`, `address`. |
| orders | `key`, `content`, `status`, `sheetDate`, `supplement`, `checked`, `ordersChecked`, tùy chọn `receivedAt` ISO datetime. |
| orderReconciliation | `{}`: yêu cầu Node đọc lại key trên Sheet để đối soát việc xóa, không gửi danh sách key có thể cũ. |

Tiền là DECIMAL(15,2), tỷ lệ chiết khấu từ 0–100 theo đơn vị phần trăm, không dùng số thực nhị phân để tính tiền. Số lượng đã bán giữ DECIMAL(15,3), chưa tự coi là hạn mức hoặc thay đổi theo hóa đơn.

## Thiết lập Apps Script

File `apps-script/Code.gs` là code để cài vào Apps Script gắn với workbook. Repository không tự deploy, thay trigger hay sửa Script Properties của workbook hiện có. Plugin Check đơn hoàn toàn không đổi.

1. Điền Script Properties `NODE_SYNC_URL` (HTTPS endpoint đầy đủ), `SHEET_SYNC_SECRET` (khớp Node, ít nhất 32 ký tự).
2. Điền `ENTITY_SHEETS` nếu tên tab thực tế khác mặc định; chỉ khai báo các tab đã sẵn sàng. Ví dụ:

   ```json
   {"customers":"Khách hàng","products":"Sản Phẩm","specificPrices":"Giá riêng","orders":"Đơn Hàng"}
   ```

3. Chạy `installSyncTriggers()` một lần để cấp quyền. Nó lưu `WORKBOOK_ID`, tạo hàng đợi ẩn và cài installable onEdit/onChange + trigger gửi hàng đợi mỗi phút. Không dùng simple onEdit để gọi HTTP.
4. Chạy `enqueueAllCatalog()` để import dữ liệu hiện có. Thứ tự mặc định gửi khách/sản phẩm trước các bảng tham chiếu. Thiếu FK tạm thời trả 409 và retry sau.
5. Kiểm tra hàng đợi ẩn `_CheckDonSyncQueue`. `DONE` chỉ sau ACK đúng event/cache ready. HTTP 400/403 chuyển `ERROR` để người vận hành sửa mapping/dữ liệu; lỗi tạm thời giữ `PENDING`. Không in payload chứa thông tin khách ra log.
6. Khi công thức, script khác hoặc Google API thay dữ liệu, onEdit không chạy. Chủ động gọi `enqueueAllCatalog()` hoặc bổ sung trigger phù hợp; không giả định mọi loại thay đổi đều có onEdit.

Hàng đợi đặt trong Sheet, mỗi payload <=45.000 ký tự để không vượt giới hạn một ô. Không xóa/đổi thứ tự dòng hàng đợi đang gửi. Cần dọn DONE định kỳ khi worker dừng để tránh tab phình lớn; chưa có cơ chế tự dọn/quản lý quota. Full import lớn cần chia đợt phù hợp quota Apps Script.

### Mapping Sheet đang cũ hơn code

Mapping mặc định hỗ trợ các header đã cung cấp:

- Khách: `Mã KH`, `Khách hàng`, `Địa chỉ`, `Tỉnh`, `Phân loại`, `Không KM`, `Khách PXK`, `Địa chỉ PXK`.
- Sản phẩm: `Mã SP`, `Sản phẩm`, `ĐVT`, `Giá`, `Khuyến mãi`, `Chiết khấu`.
- Giá riêng: `Mã KH`, `Khách hàng`, `Mã SP`, `Sản phẩm`, `Đơn giá`, `Chiết khấu`, `Khuyến mãi`.
- Chương trình KM: `Mã SP`, tên SP để hiển thị, `Khuyến mãi`, `Từ ngày`, `Đến ngày`.
- Hạn dùng: `Mã SP`, tên SP, `Số lô`, `Date`.
- Bệnh viện: `Mã KH`, tên KH, `Mã SP`, tên SP, `Đơn giá`, `Chiết khấu`, `Đã bán`.

Tên khách/sản phẩm ở các tab phụ chỉ là hiển thị, không tạo FK bằng tên. Tên chuẩn lấy từ danh mục chính.

Đổi tên cột bằng Script Property `HEADER_ALIASES`, ví dụ:

```json
{"products":{"Mã SP":"Mã sản phẩm mới"},"customers":{"Mã KH":"Mã khách"}}
```

Đây là mapping nguồn cũ → canonical model, không phải đổi schema MySQL. `Phân loại` theo model mới là integer; nếu Sheet cũ dùng nhãn, khai báo `CATEGORY_MAP`, ví dụ `{"Nhóm A":1,"Nhóm B":2}`. Không tự suy diễn bitmask `hasFeatures`. Checkbox `Không KM=true` ánh xạ `isPromoted=0`; tên/địa chỉ PXK lưu trong CustomerFeature.

Cột % ở Sheet được chuyển thành phần trăm: giá trị 0.05 có format `%` → 5, ô số 5 → 5. Văn bản tiền có dấu phân cách địa phương cần được chuẩn hóa thành ô số/chuỗi thập phân hợp lệ, không tự đoán `1.000` là 1 hay 1000.

Chương trình KM được thêm cột kỹ thuật ẩn `_sync_id` để sửa ngày/chính sách vẫn cập nhật cùng bản ghi. Không copy trùng ID; khi nhân bản một chương trình cần để ID trống để script tạo mới. `Date` của lô giữ cả dạng tháng/năm nếu nguồn như vậy, không tự gán ngày.

Chưa chốt xóa vật lý khách/sản phẩm/giá/KM: không tự xóa theo việc dòng biến mất. Có thể thêm cột `Đang dùng` = 0 để vô hiệu hóa những entity hỗ trợ `isActive`. Đổi mã KH/SP hay khóa cặp được coi là bản ghi mới; cần quy trình đổi khóa riêng, không tự nối nhầm lịch sử.

## Đơn hàng, Sheet layout và orders_ok

`ORDER_SHEET_LAYOUT=postdon` là mặc định theo code Postdon: A=key, C=nội dung, E=thời điểm nhận, B/D/F/G được giữ. Không thay layout mặc định chỉ vì Sheet cũ còn khác code.

Nếu dùng Sheet sáu cột kế toán đã mô tả, đặt **cả Node và Script Property** `ORDER_SHEET_LAYOUT=accounting`. Các header: `Nội dung`, `Trạng thái`, `Ngày`, `Bổ sung`, `Checked`, `Orders_checked`; script thêm cột khóa ẩn `_order_key`. Node có thể đổi mapping header bằng `ORDER_SHEET_COLUMNS` JSON. Profile accounting kiểm tra đủ header và không phụ thuộc thứ tự cột.

Key Telegram là `chatId:messageId`; đơn nhập tay được cấp `sheet:UUID`. Chạy import/khởi tạo key trước khi bật đối soát xóa. Node chỉ tự chiếu nội dung/ngày nhận khi tạo và nội dung khi sửa; không ghi đè các ô kế toán. Giá trị gốc của Checked/Orders_checked được lưu JSON, chưa gán ý nghĩa boolean/quy trình khi chưa chốt.

Đơn được lưu MySQL cùng job outbox trong transaction. Worker đọc job, tạo/sửa bản chiếu Sheet và chỉ ACK đúng revision. Sheet lỗi thì job vẫn còn; Telegram đã có thể được xác nhận vì đơn đã bền vững trong MySQL. Chỉ một worker ghi một workbook, không chạy bot cũ cùng token.

Khi xóa dòng, installable onChange gửi yêu cầu đối soát. Node đọc key thực tế từ Sheet (không tin snapshot key cũ gửi từ client), rồi chuyển các đơn đã từng chiếu và đang vắng mặt sang `orders_ok`. Copy và xóa ở cùng transaction; lỗi copy thì bản gốc còn nguyên. Hai bảng có cùng cấu trúc, gồm ID/key, nội dung, metadata kế toán và timestamp. Đơn đã chuyển không tự hồi sinh khi Telegram replay.

Đối soát từ chối thao tác nếu header/key sai, key trùng hoặc không đọc được Sheet. Đơn chưa từng chiếu/đang có outbox không bị hiểu nhầm là đã xóa. Cần tránh vừa xóa dòng vừa có thao tác ghi đơn đó đang chờ; Sheet không có transaction với MySQL. Có thể yêu cầu đối soát lại sau khi outbox xử lý xong. Khôi phục đơn từ orders_ok chưa được tự động hóa.

## Cấu hình và vận hành

MySQL: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`. TLS mặc định bật và xác minh chứng chỉ; `DB_CA` nếu dùng CA riêng. `DB_TLS=false` chỉ dành cho MySQL local có chủ đích, không phải cách bỏ qua lỗi chứng chỉ máy chủ thật.

HTTP sync: `SHEET_SYNC_SECRET`, `CHECKDON_WORKBOOK_ID`. Shared secret HMAC/private key Google cần giá trị thật trong process/secret manager, không dùng proxy placeholder làm khóa ký.

Postdon/bản chiếu/đối soát: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `ORDER_SHEET_NAME`, các cấu hình layout; worker Telegram thêm `TELEGRAM_BOT_TOKEN`, tùy chọn `TELEGRAM_ALLOWED_CHAT_IDS`.

Cloud cần HTTP egress tới AuthKit, `api.telegram.org`, `oauth2.googleapis.com`, `sheets.googleapis.com`; MySQL dùng kết nối TCP tới DB host/port, không đi qua HTTP proxy. Cấu hình TCP/VPN theo môi trường trước khi chạy thật. Không có giá trị credential hoặc địa chỉ DB sản xuất được cài sẵn trong repository.
