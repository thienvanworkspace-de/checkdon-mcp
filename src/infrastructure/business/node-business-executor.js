import { BusinessExecutor } from "../../application/ports/business-executor.js";
import { successResponse } from "../../application/contracts/business-contract.js";

/** Backend hiện tại: toàn bộ nghiệp vụ vẫn chạy bằng Node.js. */
export class NodeBusinessExecutor extends BusinessExecutor {
    constructor({ useCaseFactory }) { super(); this.useCases = useCaseFactory; }
    async execute(request) {
        const handler = this.useCases.create(request.operation);
        const data = await handler.execute(request.payload, request.context);
        // Cùng serialization boundary với HTTP/SQL, loại undefined và không lộ ORM instance.
        return successResponse(request, JSON.parse(JSON.stringify(data)));
    }
}
