// 发布 0.12.86:适配 DeepSeek Harness v0.1.1-rc.1。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EN = `## 0.12.86
- Adapt to DeepSeek Harness v0.1.1-rc.1: ① ask_user_question answers now support multiline input in the extension (web parity): the custom answer field in question cards and the plan-review inline feedback are multiline textareas with auto-wrap and auto-grow — Enter submits (or moves to the next question), Shift+Enter inserts a newline; ② the new multimodal model DeepSeek-V4-Flash-Vision-Exp appears automatically (server-driven model list); ③ audited the wire contract against 0.1.1-rc.1: session.prompt, ask_user_question, commands/execute (incl. the images parameter), commands/list descriptors, fileReferences, sessionReferenceResolver, and dynamicCordisRunner are all unchanged and compatible — the remaining 0.1.1 changes (composer @-reference layout, Bubblewrap sandbox hardening, Markdown table rendering, cache precision) are web/server-side.
- 适配 DeepSeek Harness v0.1.1-rc.1:① ask_user_question 回答支持多行输入(网页端同款):提问卡自定义回答与计划审批的内联修改意见改为多行输入框,自动换行、自适应高度 —— 回车提交(或进入下一题),Shift+Enter 换行;② 新增多模态模型 DeepSeek-V4-Flash-Vision-Exp 自动出现在模型下拉(服务器驱动);③ 线协议逐项核对 0.1.1-rc.1:session.prompt、ask_user_question、commands/execute(含 images 参数)、commands/list 描述符、fileReferences、sessionReferenceResolver、dynamicCordisRunner 全部兼容;其余 0.1.1 改动(输入框 @ 引用布局、Bubblewrap 沙箱加固、Markdown 表格、缓存精度)均为网页端/服务器侧,无需改动。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const readme = readFileSync(`${root}README.md`, "utf8");
writeFileSync(`${root}README.md`, readme.split(pkg.version).join(version), "utf8");

for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${s.slice(i + marker.length)}` : `${marker}\n\n${EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
