import * as z from "zod/v4";
import { operations } from "../application/contracts/business-contract.js";

/** Cấu hình theo operation, không cho request/client chọn backend hay procedure tùy ý. */
export function loadBusinessConfig(env = {}) {
    const routes = z.object(Object.fromEntries(Object.keys(operations).map(name =>
        [name, z.enum(["node", "procedure", "http"]).optional()]))).strict();
    const procedures = z.object(Object.fromEntries(Object.keys(operations).map(name =>
        [name, z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional()]))).strict();
    return {
        routes: routes.parse(JSON.parse(env.BUSINESS_ROUTES || "{}")),
        procedures: procedures.parse(JSON.parse(env.BUSINESS_PROCEDURES || "{}")),
        remote: { url: env.BUSINESS_SERVICE_URL || "", token: env.BUSINESS_SERVICE_TOKEN,
            timeoutMs: Number(env.BUSINESS_SERVICE_TIMEOUT_MS || 15000) }
    };
}
