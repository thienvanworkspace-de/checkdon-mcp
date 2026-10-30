import {
    Client,
    StreamableHTTPClientTransport
} from "@modelcontextprotocol/client";

const client = new Client({
    name: "checkdon-test-client",
    version: "1.0.0"
});

const transport = new StreamableHTTPClientTransport(
    new URL("https://site--checkdon-mcp--6zt5v8kxj6g9.code.run/mcp")
);

async function main() {
    try {
        // Bước 1: Kết nối và thực hiện MCP handshake
        await client.connect(transport);
        console.log("1. Kết nối MCP thành công!");

        // Bước 2: Yêu cầu server liệt kê các công cụ
        const { tools } = await client.listTools();

        console.log("\n2. Các công cụ MCP:");
        console.log(tools.map(tool => tool.name));

        // Bước 3: Gọi công cụ hello_checkdon
        const result = await client.callTool({
            name: "hello_checkdon",
            arguments: {
                name: "Anh"
            }
        });

        console.log("\n3. Kết quả gọi công cụ:");
        console.log(result.content);

        if (result.isError) {
            throw new Error("MCP tool trả về lỗi.");
        }
    } catch (error) {
        console.error("Kiểm thử MCP thất bại:", error);
        process.exitCode = 1;
    } finally {
        await client.close().catch(() => {});
    }
}

main();