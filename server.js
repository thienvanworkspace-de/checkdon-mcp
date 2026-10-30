import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
    McpServer,
    createMcpHandler
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const PORT = Number(process.env.PORT) || 3000;

const AUTHKIT_ISSUER =
    process.env.AUTHKIT_ISSUER ||
    "https://right-haven-96-staging.authkit.app";

const MCP_RESOURCE_URL =
    process.env.MCP_RESOURCE_URL ||
    "https://site--checkdon-mcp--6zt5v8kxj6g9.code.run/mcp";

import { createRemoteJWKSet, jwtVerify } from "jose";

// Hai hằng số AUTHKIT_ISSUER và MCP_RESOURCE_URL
// đã được khai báo phía trên.

const JWKS = createRemoteJWKSet(
    new URL(`${AUTHKIT_ISSUER}/oauth2/jwks`)
);

const RESOURCE_METADATA_URL =
    `${new URL(MCP_RESOURCE_URL).origin}` +
    "/.well-known/oauth-protected-resource";

// Thay các email minh họa bằng email Google thật
// của những người được phép dùng Check đơn.
const ALLOWED_EMAILS = new Set([
    "thienvanworkspace@gmail.com",
    "nxde2000@gmail.com",
    "nhungcun250119@gmail.com"
].map(email => email.trim().toLowerCase()));

// =========================
// 1. SCHEMA DỮ LIỆU ĐẦU VÀO
// =========================

const orderProductSchema = z.object({
    product_code: z.string(),
    qty: z.number(),
    unit_price: z.number().nullable().optional(),
    discount_rate: z.number().nullable().optional(),
    promotion_policy: z.string().nullable().optional()
});

const orderSchema = z.object({
    order_number: z.string(),
    customer_code: z.string(),
    products: z.array(orderProductSchema),
    discount_rate: z.number().nullable().optional(),
    promotion_policy: z.string().nullable().optional(),
    isPromoted: z.boolean().nullable().optional()
});

const invoiceProductSchema = z.object({
    line: z.number().nullable().optional(),
    product_code: z.string(),
    lot_number: z.string().nullable().optional(),
    expiry_date: z.string().nullable().optional(),
    qty: z.number(),
    unit_price: z.number(),
    amount: z.number(),
    discount_rate: z.number().nullable().optional(),
    discount_amount: z.number().nullable().optional(),
    net_amount: z.number()
});

const invoiceSchema = z.object({
    invoice_number: z.string(),
    customer_code: z.string(),
    products: z.array(invoiceProductSchema),
    discount_rate: z.number().nullable().optional(),
    discount_amount: z.number().nullable().optional(),
    net_amount: z.number()
});

// =========================
// 2. TẠO MCP HANDLER
// =========================

const mcpHandler = createMcpHandler(() => {
    const server = new McpServer({
        name: "checkdon-mcp",
        version: "1.0.0"
    });

    // Công cụ kiểm tra kết nối
    server.registerTool(
        "hello_checkdon",
        {
            title: "Hello CheckDon",
            description: "Kiểm tra kết nối MCP.",
            inputSchema: z.object({
                name: z.string().min(1)
            }),
            securitySchemes: [
                {
                    type: "oauth2",
                    scopes: ["openid", "profile", "email"]
                }
            ]
        },
        async ({ name }) => ({
            content: [
                {
                    type: "text",
                    text: `Xin chào ${name}! MCP Check đơn hoạt động thành công.`
                }
            ]
        })
    );

    // Công cụ nhận JSON đơn hàng và hóa đơn
    server.registerTool(
        "check_invoice",
        {
            title: "Check Invoice",
            description:
                "Nhận JSON đơn hàng và hóa đơn đã được GPT chuẩn hóa. " +
                "Phiên bản hiện tại chỉ trả kết quả minh họa, " +
                "chưa kiểm tra nghiệp vụ và chưa kết nối Google Sheets.",

            // API mới: bọc schema bằng z.object()
            inputSchema: z.object({
                order: orderSchema,
                invoice: invoiceSchema
            }),
            securitySchemes: [
                {
                    type: "oauth2",
                    scopes: ["openid", "profile", "email"]
                }
            ]
        },
        async ({ order, invoice }) => {
            console.log("\n========== CHECK INVOICE ==========");
            console.log("Order:", JSON.stringify(order, null, 2));
            console.log("Invoice:", JSON.stringify(invoice, null, 2));

            // Kết quả mẫu, chưa phải kết quả kiểm tra thực tế
            const output = {
                message_code: "DEMO_ONLY",
                message:
                    `Đã nhận đơn ${order.order_number} và ` +
                    `hóa đơn ${invoice.invoice_number}. ` +
                    "API hiện chỉ chạy chế độ demo, chưa kiểm tra " +
                    "giá, chiết khấu hoặc khuyến mãi. " +
                    "Các lỗi bên dưới chỉ là dữ liệu minh họa.",
                errors: [
                    {
                        error_code: "DEMO_PRICE_MISMATCH",
                        error_message:
                            "[DỮ LIỆU MẪU] Đơn giá trên hóa đơn " +
                            "có thể khác giá được phép áp dụng."
                    },
                    {
                        error_code: "DEMO_PROMOTION_MISMATCH",
                        error_message:
                            "[DỮ LIỆU MẪU] Khuyến mãi trên hóa đơn " +
                            "có thể chưa phù hợp với chính sách."
                    }
                ]
            };

            console.log("Output:", JSON.stringify(output, null, 2));

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(output, null, 2)
                    }
                ]
            };
        }
    );

    return server;
});

// =========================
// 3. HTTP SERVER
// =========================

const allowedHosts = process.env.ALLOWED_HOSTS
    ?.split(",")
    .map(host => host.trim())
    .filter(Boolean);

const app = allowedHosts?.length
    ? createMcpExpressApp({
        host: "0.0.0.0",
        allowedHosts
    })
    : createMcpExpressApp();

app.get("/.well-known/oauth-protected-resource", (req, res) => {
    res.json({
        resource: MCP_RESOURCE_URL,
        authorization_servers: [AUTHKIT_ISSUER],
        bearer_methods_supported: ["header"]
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "checkdon-mcp"
    });
});

/*
const nodeHandler = toNodeHandler(mcpHandler);

app.all("/mcp", (req, res) => {
    void nodeHandler(req, res, req.body);
});
*/

const nodeHandler = toNodeHandler(mcpHandler);

const WWW_AUTHENTICATE_HEADER = [
    'Bearer error="unauthorized"',
    'error_description="Authorization needed"',
    `resource_metadata="${RESOURCE_METADATA_URL}"`
].join(", ");

app.all("/mcp", async (req, res) => {
    // 1. Lấy access token từ HTTP Authorization header
    const token = req.headers.authorization
        ?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
        res.setHeader(
            "WWW-Authenticate",
            WWW_AUTHENTICATE_HEADER
        );

        return res.status(401).json({
            error: "unauthorized",
            message: "Cần đăng nhập để sử dụng Check đơn."
        });
    }

    // 2. Xác minh chữ ký JWT, issuer, audience và hạn dùng
    let payload;

    try {
        ({ payload } = await jwtVerify(token, JWKS, {
            issuer: AUTHKIT_ISSUER,
            audience: MCP_RESOURCE_URL
        }));
    } catch (error) {
        console.warn(
            "[AUTH] Token không hợp lệ:",
            error.code ?? error.message
        );

        res.setHeader(
            "WWW-Authenticate",
            WWW_AUTHENTICATE_HEADER
        );

        return res.status(401).json({
            error: "invalid_token",
            message: "Access token không hợp lệ hoặc đã hết hạn."
        });
    }

    if (typeof payload.sub !== "string") {
        return res.status(401).json({
            error: "invalid_token",
            message: "Token thiếu định danh người dùng."
        });
    }

    // 3. Lấy email từ WorkOS UserInfo endpoint.
    // Không tin email do GPT tự truyền trong JSON.
    let userInfo;

    try {
        const response = await fetch(
            `${AUTHKIT_ISSUER}/oauth2/userinfo`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            console.error(
                "[AUTH] UserInfo trả HTTP",
                response.status
            );

            return res.status(502).json({
                error: "identity_lookup_failed",
                message: "Không xác minh được danh tính người dùng."
            });
        }

        userInfo = await response.json();
    } catch (error) {
        console.error(
            "[AUTH] Không kết nối được UserInfo:",
            error.message
        );

        return res.status(502).json({
            error: "identity_lookup_failed",
            message: "Dịch vụ xác minh danh tính tạm thời không khả dụng."
        });
    }

    // 4. Chỉ chấp nhận email đã xác minh
    const email = typeof userInfo.email === "string"
        ? userInfo.email.trim().toLowerCase()
        : "";

    if (!email || userInfo.email_verified !== true) {
        return res.status(403).json({
            error: "email_not_verified",
            message: "Tài khoản chưa có email được xác minh."
        });
    }

    // 5. Kiểm tra danh sách email được phép
    if (!ALLOWED_EMAILS.has(email)) {
        console.warn("[AUTH] Từ chối người dùng không được phép.");

        return res.status(403).json({
            error: "access_denied",
            message: "Tài khoản không được phép sử dụng Check đơn."
        });
    }

    // 6. Đã xác thực và được cấp quyền, chuyển tiếp đến MCP
    console.log(`[AUTH] Đã xác thực người dùng: ${email}`);

    try {
        await nodeHandler(req, res, req.body);
    } catch (error) {
        console.error("[MCP] Lỗi xử lý request:", error.message);

        if (!res.headersSent) {
            res.status(500).json({
                error: "internal_error",
                message: "MCP server gặp lỗi nội bộ."
            });
        }
    }
});


app.listen(PORT, "0.0.0.0", () => {
    console.log(`CheckDon MCP running on port ${PORT}`);
});