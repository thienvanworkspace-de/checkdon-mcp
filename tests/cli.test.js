import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const cwd = new URL("..", import.meta.url);
// Kể cả môi trường thực có khóa, các test CLI này không được bật dịch vụ bên ngoài.
const env = {
    ...process.env, DATA_PROVIDER: "memory", PORT: "0", TELEGRAM_BOT_TOKEN: "", CHECKDON_WORKBOOK_ID: "",
    GOOGLE_CLIENT_EMAIL: "", GOOGLE_PRIVATE_KEY: ""
};

test("npm start ở chế độ memory kiểm thử khởi động HTTP không cần khóa postdon và dừng sạch bằng SIGTERM", { timeout: 10_000 }, async () => {
    // Dùng nguyên lệnh Node trong package script, không qua shell để quản lý đúng PID.
    const child = spawn(process.execPath, ["--env-file-if-exists=.env", "--use-env-proxy", "server.js"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const exited = once(child, "exit");
    let output = "";
    const ready = new Promise((resolve, reject) => {
        child.stdout.on("data", chunk => {
            output += chunk;
            const match = /running on port (\d+)/.exec(output);
            if (match) resolve(Number(match[1]));
        });
        child.once("error", reject);
        child.once("exit", code => reject(new Error(`Server thoát sớm: ${code}`)));
    });
    try {
        const port = await ready;
        assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    } finally {
        child.kill("SIGTERM");
        const [code, signal] = await exited;
        assert.equal(code, 0);
        assert.equal(signal, null);
    }
});

test("entry point postdon/all thiếu cấu hình trả lỗi trước khi truy cập dịch vụ thật", { timeout: 10_000 }, async () => {
    for (const script of ["scripts/start-postdon.js", "scripts/start-all.js"]) {
        const child = spawn(process.execPath, ["--env-file-if-exists=.env", "--use-env-proxy", script], { cwd, env });
        let output = "";
        child.stderr.on("data", chunk => { output += chunk; });
        const [code] = await once(child, "exit");
        assert.equal(code, 1);
        assert.match(output, /Thiếu cấu hình postdon/);
        assert.match(output, /TELEGRAM_BOT_TOKEN/);
    }
});
