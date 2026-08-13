// 临时诊断:复刻 ServerManager.canRun 的启动器探测逻辑,输出每个候选的退出码。
import { spawn } from "node:child_process";

const quote = (s) => (process.platform === "win32" && /\s/.test(s) && !/^".*"$/.test(s) ? `"${s}"` : s);
const shellCommand = (file, args) => [file, ...args].map(quote).join(" ");

function canRun(command) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve("TIMEOUT(15s)"); }
    }, 15000);
    try {
      const child = spawn(shellCommand(command, ["--version"]), { shell: true, stdio: "ignore", windowsHide: true });
      child.once("error", (e) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(`error: ${e.message}`); }
      });
      child.once("exit", (code) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(`exit ${code}`); }
      });
    } catch (e) {
      settled = true; clearTimeout(timer); resolve(`throw: ${e.message}`);
    }
  });
}

const candidates = [
  "dsh",
  "npx.cmd",
  "npx",
  "C:\\Program Files\\nodejs\\npx.cmd",
  "C:\\Program Files (x86)\\nodejs\\npx.cmd",
  "npm.cmd",
  "C:\\Program Files\\nodejs\\npm.cmd",
];
for (const c of candidates) {
  console.log(`${c} -> ${await canRun(c)}`);
}
