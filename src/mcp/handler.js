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

        // Công cụ nhận JSON đơn hàng và hóa đơn
        server.registerTool(
            "check_invoice",
            {
                title: "Check Invoice",
                description:
                    "Nhận JSON đơn hàng và hóa đơn đã được GPT chuẩn hóa. " +
                    "Phiên bản hiện tại chỉ trả kết quả minh họa, " +
                    "chưa đối chiếu hóa đơn với dữ liệu nghiệp vụ.",

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
