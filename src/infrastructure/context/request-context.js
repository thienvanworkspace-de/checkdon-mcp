import { AsyncLocalStorage } from "node:async_hooks";

/** Chỉ truyền danh tính đã xác thực, không forward bearer token/HTTP headers tới business. */
export class RequestContext {
    constructor() { this.storage = new AsyncLocalStorage(); }
    run(context, operation) { return this.storage.run(Object.freeze({ ...context }), operation); }
    get() { return this.storage.getStore() ?? {}; }
}
