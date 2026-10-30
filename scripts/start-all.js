import { runMain } from "../src/runtime.js";

// Một process chạy cả MCP và tác vụ nhận đơn Telegram.
await runMain({ mcp: true, postdon: true });
