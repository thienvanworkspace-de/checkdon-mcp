/**
 * Google Apps Script gắn với workbook kế toán.
 * Chỉ gửi dữ liệu và nhận ACK; MySQL/Node mới là nơi kiểm tra và lưu trữ chính.
 * Script Properties: NODE_SYNC_URL, SHEET_SYNC_SECRET, WORKBOOK_ID (install tự đặt).
 */
const SYNC_QUEUE = '_CheckDonSyncQueue';
const DEFAULT_ENTITY_SHEETS = {
  customers: 'Khách hàng', products: 'Sản Phẩm', specificPrices: 'Giá riêng',
  programPromotions: 'Chương trình KM', productLots: 'Hạn dùng', hospitalPrices: 'Bệnh viện', orders: 'Đơn Hàng'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CheckDon')
    .addItem('Cài trigger đồng bộ', 'installSyncTriggers')
    .addItem('Đưa toàn bộ danh mục vào hàng đợi', 'enqueueAllCatalog')
    .addItem('Gửi lại các thay đổi đang chờ', 'flushSyncQueue')
    .addItem('Đối soát đơn đã xóa', 'requestOrderReconciliation').addToUi();
}

/** Chạy thủ công một lần, cấp quyền rồi kiểm tra Script Properties trước khi dùng. */
function installSyncTriggers() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('WORKBOOK_ID', book.getId());
  withSyncLock(function () { getQueue(book); });
  const ownHandlers = ['captureSheetEdit', 'captureSheetChange', 'flushSyncQueue'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (ownHandlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
  // Simple onEdit không có đủ quyền gọi HTTP; dùng installable trigger.
  ScriptApp.newTrigger('captureSheetEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('captureSheetChange').forSpreadsheet(book).onChange().create();
  ScriptApp.newTrigger('flushSyncQueue').timeBased().everyMinutes(1).create();
}

function captureSheetEdit(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  const entity = entityForSheet(sheet.getName());
  if (!entity) return; // Ghi từ Node/Google API không kích hoạt onEdit, tránh vòng lặp.
  withSyncLock(function () {
    const start = Math.max(2, event.range.getRow());
    const end = event.range.getLastRow();
    for (let row = start; row <= end; row++) enqueueRow(sheet, entity, row);
  });
  // Không gọi HTTP ngay trong onEdit: hàng đợi bền vững tồn tại trước khi gửi.
}

/** Import ban đầu hoặc đối soát lại sau khi công thức/nguồn ngoài thay đổi. */
function enqueueAllCatalog() {
  const book = getWorkbook();
  const mapping = entitySheets();
  withSyncLock(function () {
    Object.keys(mapping).forEach(function (entity) {
      const sheet = book.getSheetByName(mapping[entity]);
      if (!sheet) throw new Error('Thiếu tab đã cấu hình: ' + mapping[entity]);
      for (let row = 2; row <= sheet.getLastRow(); row++) enqueueRow(sheet, entity, row);
    });
  });
}

function enqueueRow(sheet, entity, rowNumber) {
  const initialWidth = sheet.getLastColumn();
  if (!initialWidth || sheet.getRange(rowNumber, 1, 1, initialWidth).getValues()[0].every(function (value) { return value === ''; })) return;
  const layout = PropertiesService.getScriptProperties().getProperty('ORDER_SHEET_LAYOUT') || 'postdon';
  if (entity === 'programPromotions') ensureStableKey(sheet, rowNumber, '_sync_id', '');
  if (entity === 'orders' && layout === 'accounting') ensureStableKey(sheet, rowNumber, '_order_key', 'sheet:');
  if (entity === 'orders' && layout === 'postdon' && !sheet.getRange(rowNumber, 1).getValue()) {
    sheet.getRange(rowNumber, 1).setValue('sheet:' + Utilities.getUuid());
  }
  const width = sheet.getLastColumn();
  if (!width) return;
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v).trim(); });
  const values = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  if (values.every(function (value) { return value === ''; })) return;
  const formats = sheet.getRange(rowNumber, 1, 1, width).getNumberFormats()[0];
  const display = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  const row = mapRow(entity, headers, values, formats, display);
  row.sourceData = {};
  headers.forEach(function (header, index) {
    if (header) row.sourceData[header] = values[index] instanceof Date ? values[index].toISOString() : values[index];
  });
  const properties = PropertiesService.getScriptProperties();
  const version = Math.max(Date.now(), Number(properties.getProperty('SYNC_VERSION') || '0') + 1);
  properties.setProperty('SYNC_VERSION', String(version));
  const event = { eventId: Utilities.getUuid(), spreadsheetId: sheet.getParent().getId(), entity: entity, version: version, row: row };
  const payload = JSON.stringify(event);
  if (payload.length > 45000) throw new Error('Dòng vượt giới hạn hàng đợi; cần chia nhỏ dữ liệu.');
  getQueue(sheet.getParent()).appendRow([event.eventId, payload, 'PENDING', '', new Date()]);
}

/** Mapping ba tab hiện có do kế toán cung cấp; không phụ thuộc vị trí cột. */
function mapRow(entity, headers, values, formats, display) {
  const aliases = JSON.parse(PropertiesService.getScriptProperties().getProperty('HEADER_ALIASES') || '{}')[entity] || {};
  function headerIndex(name) { return headers.indexOf(aliases[name] || name); }
  function field(name, optional) {
    const index = headerIndex(name);
    if (index < 0) {
      if (optional) return null;
      throw new Error('Thiếu cột: ' + name);
    }
    return values[index] === '' ? null : values[index];
  }
  function text(name, optional) { const value = field(name, optional); return value == null ? null : String(value).trim(); }
  function rate(name) {
    const value = field(name);
    if (value == null) return null;
    if (typeof value === 'number') {
      const percentFormat = formats[headerIndex(name)].indexOf('%') >= 0;
      return String(Number((percentFormat ? value * 100 : value).toFixed(10)));
    }
    return String(value).replace(/%$/, '').trim();
  }
  if (entity === 'orders') {
    const layout = PropertiesService.getScriptProperties().getProperty('ORDER_SHEET_LAYOUT') || 'postdon';
    const accounting = layout === 'accounting';
    const day = accounting ? field('Ngày') : values[4];
    const result = { key: String(accounting ? field('_order_key') : values[0]),
      content: String((accounting ? field('Nội dung') : values[2]) || ''),
      status: accounting ? text('Trạng thái') : (values[1] == null ? null : String(values[1])),
      sheetDate: day instanceof Date ? day.toISOString() : String(day || ''),
      supplement: accounting ? text('Bổ sung') : (values[3] == null ? null : String(values[3])),
      checked: accounting ? field('Checked') : (values[5] == null ? null : values[5]),
      ordersChecked: accounting ? field('Orders_checked') : (values[6] == null ? null : values[6]) };
    if (day instanceof Date) result.receivedAt = day.toISOString();
    return result;
  }
  const active = field('Đang dùng', true);
  const isActive = active == null ? 1 : (active === false || active === 0 || String(active) === '0' ? 0 : 1);
  if (entity === 'customers') {
    const noPromotion = field('Không KM');
    const noPromotionFlag = noPromotion === true || noPromotion === 1 || /^(true|1|có|x)$/i.test(String(noPromotion));
    const category = field('Phân loại');
    const categoryMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('CATEGORY_MAP') || '{}');
    const numericCategory = category == null ? null : (Object.prototype.hasOwnProperty.call(categoryMap, category) ? categoryMap[category] : Number(category));
    if (numericCategory != null && !Number.isSafeInteger(numericCategory)) throw new Error('Phân loại phải là số nguyên hoặc được khai báo trong CATEGORY_MAP.');
    return { code: text('Mã KH'), name: text('Khách hàng'), address: text('Địa chỉ'), province: text('Tỉnh'),
      category: numericCategory,
      isActive: isActive, features: { isPromoted: noPromotionFlag ? 0 : 1,
        nameOnGoodsIssueInvoice: text('Khách PXK'), addressOnGoodsIssueInvoice: text('Địa chỉ PXK') } };
  }
  if (entity === 'products') return { code: text('Mã SP'), name: text('Sản phẩm'), unit: text('ĐVT'),
    unitPrice: field('Giá') == null ? null : String(field('Giá')), promotionPolicy: text('Khuyến mãi'), discountRate: rate('Chiết khấu'), isActive: isActive };
  if (entity === 'specificPrices') return { customerCode: text('Mã KH'), productCode: text('Mã SP'),
    unitPrice: field('Đơn giá') == null ? null : String(field('Đơn giá')), discountRate: rate('Chiết khấu'),
    promotionPolicy: text('Khuyến mãi'), isActive: isActive };
  if (entity === 'programPromotions') {
    function day(name) {
      const value = field(name);
      return value instanceof Date ? Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : value;
    }
    return { sourceKey: text('_sync_id'), productCode: text('Mã SP'), promotionPolicy: text('Khuyến mãi'),
      fromDate: day('Từ ngày'), toDate: day('Đến ngày'), isActive: isActive };
  }
  if (entity === 'productLots') return { productCode: text('Mã SP'), lotNumber: text('Số lô'),
    expiryDate: String(display[headerIndex('Date')] || '').trim(), isActive: isActive };
  if (entity === 'hospitalPrices') return { customerCode: text('Mã KH'), productCode: text('Mã SP'),
    unitPrice: field('Đơn giá') == null ? null : String(field('Đơn giá')), discountRate: rate('Chiết khấu'),
    soldQuantity: field('Đã bán') == null ? null : String(field('Đã bán')), isActive: isActive };
  // Các bảng bổ sung dùng header canonical đúng tên thuộc tính trong docs/mysql-sync.md.
  const result = {};
  headers.forEach(function (header, index) {
    if (!header) return;
    const value = values[index];
    result[header] = value instanceof Date ? Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : (value === '' ? null : value);
  });
  return result;
}

/** ACK thành công mới đánh dấu DONE; lỗi HTTP tạm thời giữ PENDING cho lần sau. */
function flushSyncQueue() {
  withFlushLock(function () {
    const properties = PropertiesService.getScriptProperties();
    const url = properties.getProperty('NODE_SYNC_URL');
    const secret = properties.getProperty('SHEET_SYNC_SECRET');
    if (!url || !/^https:\/\//.test(url) || !secret || secret.length < 32) throw new Error('Thiếu HTTPS URL hoặc SHEET_SYNC_SECRET hợp lệ.');
    const queue = getQueue(getWorkbook());
    const rows = queue.getDataRange().getValues();
    let sent = 0;
    const started = Date.now();
    for (let index = 1; index < rows.length && sent < 30 && Date.now() - started < 240000; index++) {
      if (rows[index][2] !== 'PENDING') continue;
      sent++;
      const payload = String(rows[index][1]);
      const timestamp = Date.now();
      const bytes = Utilities.computeHmacSha256Signature(timestamp + '.' + payload, secret, Utilities.Charset.UTF_8);
      const signature = bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
      try {
        const response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
          payload: JSON.stringify({ timestamp: timestamp, payload: payload, signature: signature }),
          muteHttpExceptions: true, followRedirects: false });
        const status = response.getResponseCode();
        if (status >= 200 && status < 300) {
          const ack = JSON.parse(response.getContentText());
          if (ack.eventId !== rows[index][0] || ack.cacheReady !== true) throw new Error('ACK không khớp');
          queue.getRange(index + 1, 3, 1, 2).setValues([['DONE', '']]);
        } else {
          // Lỗi schema/workbook cần người sửa; không để một dòng hỏng chặn mọi dòng sau.
          queue.getRange(index + 1, 3, 1, 2).setValues([[status === 400 || status === 403 ? 'ERROR' : 'PENDING', 'HTTP ' + status]]);
        }
      } catch (_) { queue.getRange(index + 1, 4).setValue('Chưa nhận ACK; sẽ thử lại'); }
    }
  });
}

function entitySheets() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('ENTITY_SHEETS') || JSON.stringify(DEFAULT_ENTITY_SHEETS));
}
function entityForSheet(name) {
  const mapping = entitySheets();
  return Object.keys(mapping).find(function (entity) { return mapping[entity] === name; });
}
function getWorkbook() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('WORKBOOK_ID'));
}
function getQueue(book) {
  let queue = book.getSheetByName(SYNC_QUEUE);
  if (!queue) {
    queue = book.insertSheet(SYNC_QUEUE);
    queue.appendRow(['Event ID', 'Payload', 'Status', 'Last error', 'Queued at']);
    queue.hideSheet();
  }
  return queue;
}
function withSyncLock(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return action(); } finally { lock.releaseLock(); }
}

/** ID kỹ thuật riêng cho chương trình KM: thay ngày/chính sách vẫn cập nhật cùng bản ghi. */
function ensureStableKey(sheet, rowNumber, header, prefix) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let column = headers.indexOf(header) + 1;
  if (!column) {
    column = headers.length + 1;
    sheet.getRange(1, column).setValue(header);
    sheet.hideColumns(column);
  }
  const cell = sheet.getRange(rowNumber, column);
  if (!cell.getValue()) cell.setValue(prefix + Utilities.getUuid());
  const key = cell.getValue();
  const keys = sheet.getRange(2, column, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
  if (keys.filter(function (row) { return row[0] === key; }).length > 1) throw new Error('Trùng _sync_id chương trình KM; cần sửa trước khi đồng bộ.');
}

/** Xóa dòng đơn: Node tự đối soát Sheet hiện tại trước khi chuyển orders → orders_ok. */
function captureSheetChange(event) {
  if (!event || event.changeType !== 'REMOVE_ROW') return;
  requestOrderReconciliation();
}
function requestOrderReconciliation() {
  withSyncLock(function () {
    const book = getWorkbook();
    const properties = PropertiesService.getScriptProperties();
    const version = Math.max(Date.now(), Number(properties.getProperty('SYNC_VERSION') || '0') + 1);
    properties.setProperty('SYNC_VERSION', String(version));
    const event = { eventId: Utilities.getUuid(), spreadsheetId: book.getId(), entity: 'orderReconciliation', version: version, row: {} };
    getQueue(book).appendRow([event.eventId, JSON.stringify(event), 'PENDING', '', new Date()]);
  });
}

/** Khóa worker tách biệt khóa capture: HTTP chậm không chặn việc ghi nhận edit mới. */
function withFlushLock(action) {
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(1000)) return;
  try { return action(); } finally { lock.releaseLock(); }
}
