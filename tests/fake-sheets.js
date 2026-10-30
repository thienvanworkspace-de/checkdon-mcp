/** Fake Google API có trạng thái: test đi qua gateway/repository/business thật. */
export function fakeSheets(initialRows = [["Key", "", "Nội dung", "", "Ngày", "", ""]]) {
    const rows = structuredClone(initialRows);
    const writes = [];
    let nextWriteError;
    const client = {
        spreadsheets: {
            values: {
                async get({ range }) {
                    if (range.endsWith("!A:A")) return { data: { values: rows.map(row => [row[0]]) } };
                    return { data: { values: structuredClone(rows) } };
                },
                async update(request) {
                    if (nextWriteError) {
                        const error = nextWriteError;
                        nextWriteError = undefined;
                        throw error;
                    }
                    writes.push(structuredClone(request));
                    const address = request.range.slice(request.range.lastIndexOf("!") + 1);
                    const match = /^([A-Z]+)(\d+)/.exec(address);
                    const column = [...match[1]].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
                    const firstRow = Number(match[2]) - 1;
                    request.requestBody.values.forEach((values, offset) => {
                        rows[firstRow + offset] ??= [];
                        values.forEach((value, index) => { rows[firstRow + offset][column + index] = value; });
                    });
                    return { data: { updatedRows: request.requestBody.values.length } };
                }
            }
        }
    };
    return { client, rows, writes, failNextWrite(error = new Error("Sheet tạm ngừng")) { nextWriteError = error; } };
}
