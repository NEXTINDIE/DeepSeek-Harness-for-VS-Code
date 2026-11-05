// 发布 0.13.65:目标取消后不再残留红色芯片(命令结束后按服务端投影对齐)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.64";
const EN = `## 0.13.65
- **Cancelling a goal no longer leaves a stale red chip.** When the host had already ended the goal (for example the round budget ran out), \`goals/clear\` failed with \`no current goal\`, the error was toasted, and the chip stayed in its blocked/red state. Goal commands (create / edit / pause / resume / complete / clear) now re-read the \`goal\` projection afterwards, whatever the outcome, so the UI converges on the host's state.
- "Goal is already gone" replies are treated as success instead of an error toast.
- Typecheck plus the goal / copy / inline-image / plan suites pass.`;

const ZH = `- **取消目标后不再残留红色芯片**。宿主已经把这个目标结束掉时(例如轮数用尽),\`goals/clear\` 会返回 \`no current goal\`,界面弹出红色错误、芯片继续停在「已阻塞」状态。现在每条目标命令(新建/修改/暂停/继续/完成/取消)结束后,无论成功失败都会重新读取 \`goal\` 投影,界面收敛到宿主真实状态。
- 「目标已不存在」这类回复按成功处理,不再弹红色错误。
- typecheck 与目标菜单 / 复制 / 正文图片 / 计划模式四套夹具通过。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
let readme = readFileSync(`${root}README.md`, "utf8");
readme = readme.split(`Latest: ${PREV}`).join(`Latest: ${version}`).split(`最新版本:${PREV}`).join(`最新版本:${version}`);
writeFileSync(`${root}README.md`, readme, "utf8");
for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  writeFileSync(path, `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${ZH.trim()}\n\n${s.slice(i + marker.length)}`, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
