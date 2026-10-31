import { randomUUID } from "node:crypto";
import { businessRequestSchema, businessResponseSchema, CONTRACT_VERSION } from "../contracts/business-contract.js";
import { BusinessError } from "../contracts/business-error.js";

/** Chọn backend cho từng chức năng; transport không cần biết nơi thực thi. */
export class BusinessGateway {
    constructor({ businessExecutorFactory, businessConfig }) {
        this.factory = businessExecutorFactory;
        this.routes = businessConfig.routes;
    }

    async execute(operation, payload, context = { source: "internal" }) {
        const parsedRequest = businessRequestSchema.safeParse({ contractVersion: CONTRACT_VERSION,
            requestId: randomUUID(), operation, payload, context });
        if (!parsedRequest.success) throw new BusinessError("INVALID_BUSINESS_REQUEST", "Yêu cầu nghiệp vụ không đúng hợp đồng.");
        const request = parsedRequest.data;
        const backend = this.routes[operation] ?? "node";
        let response;
        try { response = await this.factory.create(backend).execute(request); }
        catch (error) {
            if (error instanceof BusinessError) throw error;
            throw new BusinessError("BUSINESS_EXECUTION_FAILED", "Không thực hiện được nghiệp vụ.", true);
        }
        const parsed = businessResponseSchema.safeParse(response);
        if (!parsed.success || parsed.data.requestId !== request.requestId || parsed.data.operation !== operation) {
            throw new BusinessError("INVALID_BUSINESS_RESPONSE", "Kết quả nghiệp vụ không đúng hợp đồng.");
        }
        if (!parsed.data.success) throw new BusinessError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.retryable);
        return parsed.data.data;
    }
}
