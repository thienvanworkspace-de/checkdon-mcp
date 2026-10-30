import { runMain } from "./src/runtime.js";

// Mặc định chỉ bật MCP; postdon được bật rõ ràng bằng script riêng.
await runMain({ mcp: true, postdon: false });
