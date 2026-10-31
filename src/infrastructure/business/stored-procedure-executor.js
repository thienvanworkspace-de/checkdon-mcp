import { BusinessExecutor } from "../../application/ports/business-executor.js";
import { BusinessError } from "../../application/contracts/business-error.js";

/**
 * Port SQL cho business: procedure nhận một JSON request, trả một dòng/cột `response` JSON.
 * Tên procedure lấy từ allowlist cấu hình, payload luôn dùng bind parameter.
 * Procedure tự sở hữu transaction/outbox nếu nó thực hiện lệnh ghi.
 */
export class StoredProcedureExecutor extends BusinessExecutor {
    constructor({ sequelize, businessConfig }) {
        super(); this.sequelize = sequelize; this.procedures = businessConfig.procedures;
    }

    async execute(request) {
        const name = this.procedures[request.operation];
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new BusinessError("PROCEDURE_NOT_CONFIGURED", "Stored procedure chưa được khai báo hợp lệ.");
        }
        let rows;
        try {
            rows = await this.sequelize.query(`CALL \`${name}\`(:request)`, {
                replacements: { request: JSON.stringify(request) }, logging: false
            });
        } catch {
            // Không đưa câu SQL, tham số hoặc thông tin connection ra transport.
            throw new BusinessError("PROCEDURE_EXECUTION_FAILED", "Stored procedure không thực hiện được nghiệp vụ.", true);
        }
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0].response == null) {
            throw new BusinessError("INVALID_PROCEDURE_RESPONSE", "Procedure phải trả một dòng có cột response.");
        }
        try { return typeof rows[0].response === "string" ? JSON.parse(rows[0].response) : rows[0].response; }
        catch { throw new BusinessError("INVALID_PROCEDURE_RESPONSE", "Procedure trả JSON không hợp lệ."); }
    }
}
