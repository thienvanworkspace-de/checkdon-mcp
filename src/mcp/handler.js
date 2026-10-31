import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { orderSchema, invoiceSchema } from "./schemas.js";

// Transport chỉ định nghĩa tool và chuyển việc xử lý cho lớp business.
export function createCheckdonHandler({ invoiceService }) {
    return createMcpHandler(() => {
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

        server.registerTool("check_order", {
            title: "Check Order", description: "Kiểm tra đơn bằng danh mục RAM, không truy vấn MySQL trong lời gọi tool.",
            inputSchema: z.object({ order: orderSchema }),
            securitySchemes: [{ type: "oauth2", scopes: ["openid", "profile", "email"] }]
        }, async ({ order }) => ({ content: [{ type: "text", text: JSON.stringify(await invoiceService.checkOrder({ order })) }] }));

        // Công cụ nhận JSON đơn hàng và hóa đơn
        server.registerTool(
            "check_invoice",
            {
                title: "Check Invoice",
                description:
                    "Nhận JSON đơn hàng và hóa đơn đã được GPT chuẩn hóa. " +
                    "Kiểm tra danh mục và số học trên snapshot RAM. " +
                    "Quy tắc giá/khuyến mãi chưa chốt được trả về để xác nhận.",

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
                const output = await invoiceService.checkInvoice({ order, invoice });

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
}
