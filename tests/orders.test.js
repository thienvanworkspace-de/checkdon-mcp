import test from "node:test";
import assert from "node:assert/strict";
import { fakeSheets } from "./fake-sheets.js";
import { GoogleSheetsGateway, quoteSheetName } from "../src/infrastructure/google-sheets/google-sheets-gateway.js";
import { OrderSheetRepository } from "../src/data/google-sheets/order-sheet-repository.js";
import { ProductSheetRepository } from "../src/data/google-sheets/product-sheet-repository.js";
import { OrderService } from "../src/business/order-service.js";
import { OrderUpdateHandler } from "../src/transports/telegram/order-update-handler.js";

function fixture(initialRows) {
    const fake = fakeSheets(initialRows);
    const gateway = new GoogleSheetsGateway({ client: fake.client });
    const repository = new OrderSheetRepository({ gateway, workbookId: "test-book" });
    const service = new OrderService({ orderRepository: repository, clock: () => new Date("2026-10-30T01:00:00Z") });
    const handler = new OrderUpdateHandler({ orderService: service });
    return { fake, gateway, repository, service, handler };
}

function message(fields = {}) {
    return { message_id: 12, chat: { id: -123, type: "supergroup" }, from: { id: 1, is_bot: false }, text: "Đơn ban đầu", ...fields };
}

test("tin mới ghi đúng A:G; tin sửa chỉ đổi C và không mất dữ liệu người dùng", async () => {
    const { handler, fake } = fixture();
    const created = await handler.handle({ message: message() });
    assert.equal(created.created, true);
    assert.deepEqual(fake.rows[1], ["-123:12", "", "Đơn ban đầu", "", "2026-10-30 08:00:00", "", ""]);
    fake.rows[1][1] = "KH001";
    fake.rows[1][6] = "Đã duyệt";
    const edited = await handler.handle({ edited_message: message({ text: "Đơn sửa" }) });
    assert.equal(edited.updated, true);
    assert.equal(fake.writes.at(-1).range, "'Đơn Hàng'!C2");
    assert.deepEqual(fake.rows[1], ["-123:12", "KH001", "Đơn sửa", "", "2026-10-30 08:00:00", "", "Đã duyệt"]);
});

test("update gửi lại và hai lần tạo đồng thời không sinh đơn trùng", async () => {
    const { handler, fake } = fixture();
    const results = await Promise.all([
        handler.handle({ message: message() }), handler.handle({ message: message() })
    ]);
    assert.equal(results.filter(x => x.created).length, 1);
    assert.equal(fake.rows.length, 2);
    await handler.handle({ edited_message: message({ text: "Bản đã sửa" }) });
    assert.equal((await handler.handle({ message: message() })).reason, "ORDER_EXISTS");
    assert.equal(fake.rows[1][2], "Bản đã sửa");
});

test("tin chỉnh sửa không tồn tại không được append; nội dung trống bị bỏ qua", async () => {
    const { service, fake } = fixture();
    assert.equal((await service.updateOrder("missing", "Sửa")).reason, "ORDER_NOT_FOUND");
    assert.equal((await service.postOrder("key", " \n ")).reason, "EMPTY_CONTENT");
    assert.equal((await service.updateOrder("key", "")).reason, "EMPTY_CONTENT");
    await assert.rejects(service.postOrder(" ", "data"), /key/);
    assert.equal(fake.writes.length, 0);
});

test("chỉ nhận nhóm/người thật, lọc chat và đọc caption", async () => {
    const { service, handler, fake } = fixture();
    for (const fields of [{ chat: { id: 1, type: "private" } }, { from: { is_bot: true } }, { from: undefined }]) {
        assert.equal((await handler.handle({ message: message(fields) })).ignored, true);
    }
    const restricted = new OrderUpdateHandler({ orderService: service, allowedChatIds: ["-999"] });
    assert.equal((await restricted.handle({ message: message() })).reason, "CHAT_NOT_ALLOWED");
    await handler.handle({ message: message({ text: undefined, caption: "Đơn trong ảnh" }) });
    assert.equal(fake.rows[1][2], "Đơn trong ảnh");
});

test("ghi RAW để giữ nguyên công thức và không ghi đè tiêu đề trên tab trống", async () => {
    const { service, fake } = fixture([]);
    await service.postOrder("key", '=IMPORTXML("example", "//x")');
    assert.equal(fake.writes[0].valueInputOption, "RAW");
    assert.equal(fake.writes[0].range, "'Đơn Hàng'!A2:G2");
    assert.equal(fake.rows[1][2], '=IMPORTXML("example", "//x")');
});

test("key trùng có sẵn bị báo lỗi; lỗi ghi không làm hỏng hàng đợi", async () => {
    const duplicate = fixture([["Key"], ["key"], ["key"]]);
    await assert.rejects(duplicate.service.updateOrder("key", "Sửa"), /bị trùng/);
    assert.equal(duplicate.fake.writes.length, 0);
    const { service, fake } = fixture();
    fake.failNextWrite();
    await assert.rejects(service.postOrder("key", "Đơn"), /tạm ngừng/);
    assert.equal((await service.postOrder("key", "Đơn")).created, true);
});

test("gateway chọn dòng cuối theo toàn phạm vi và quote đúng tên tab", async () => {
    const { gateway, fake } = fixture([["Key"], [], ["", "", "còn dữ liệu"]]);
    await gateway.withWriteLock(() => gateway.append("book", "'Đơn Hàng'!A:G", [["new", "", "đơn", "", "", "", ""]]));
    assert.equal(fake.writes[0].range, "'Đơn Hàng'!A4:G4");
    assert.equal(quoteSheetName("Đơn 'mới'"), "'Đơn ''mới'''" );
    await assert.rejects(gateway.append("book", "'Đơn Hàng'!A:G", [[1]]), /7 cột/);
    assert.throws(() => gateway.parseColumnRange("'Đơn Hàng'!G:A"));
});

test("danh mục giữ dữ liệu A:F gồm tiêu đề cho tới khi có schema chính thức", async () => {
    const { gateway, fake } = fixture([["Mã", "Tên"], ["SP001", "Sản phẩm"]]);
    const products = new ProductSheetRepository({ gateway, workbookId: "book" });
    assert.deepEqual(await products.getProducts(), fake.rows);
});

test("composition root nối polling → business → Sheet và đọc danh mục bằng cùng gateway", async () => {
    const { createApplicationContainer, registerPostdon } = await import("../src/container.js");
    const { fake, gateway } = fixture();
    const controller = new AbortController();
    let received = false;
    const client = { async getUpdates() {
        if (received) { controller.abort(); return []; }
        received = true;
        return [
            { update_id: 1, message: message() },
            { update_id: 2, edited_message: message({ text: "Đơn đã sửa qua worker" }) }
        ];
    } };
    const container = createApplicationContainer({ config: {
        dataProvider: "mysql", database: {}, sync: {}, postdon: {
            botToken: "fake", workbookId: "fake", clientEmail: "fake", privateKey: "fake"
        }
    }, logger: { info() {}, warn() {} }, overrides: {
        orderRepository: new OrderSheetRepository({ gateway, workbookId: "test-book" })
    } });
    await registerPostdon(container, { gateway, client });
    const services = container.cradle;
    await services.poller.run(controller.signal);
    assert.equal(fake.rows.length, 2);
    assert.equal(fake.rows[1][2], "Đơn đã sửa qua worker");
    assert.equal(services.poller.offset, 3);
    await container.dispose();
});

test("layout accounting ánh xạ theo header đổi thứ tự; không sửa các cột kế toán", async () => {
    const fake = fakeSheets([["Trạng thái", "Ngày", "_order_key", "Bổ sung", "Orders_checked", "Nội dung", "Checked"],
        ["Đã duyệt", "31/10/2026", "-123:12", "Ghi chú", "[]", "Nội dung cũ", true]]);
    const gateway = new GoogleSheetsGateway({ client: fake.client });
    const repository = new OrderSheetRepository({ gateway, workbookId: "book", sheetLayout: "accounting" });
    await repository.updateContent("-123:12", "Nội dung mới");
    assert.equal(fake.writes[0].range, "'Đơn Hàng'!F2");
    assert.equal(fake.rows[1][0], "Đã duyệt");
    assert.equal(fake.rows[1][6], true);
    assert.deepEqual([...await repository.listKeys()], ["-123:12"]);
    fake.rows[0][2] = "Cột sai";
    await assert.rejects(repository.listKeys(), /thiếu hoặc trùng/);
});
