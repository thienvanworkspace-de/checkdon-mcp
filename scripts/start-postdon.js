import { runMain } from "../src/runtime.js";

// Worker Telegram độc lập: không cần mở HTTP/MCP.
await runMain({ mcp: false, postdon: true });
