// 发布 0.13.52:按会话草稿 + 工作步骤收起时机 + 思考翻译按钮。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.51";
const ENTRY_EN = `## 0.13.52
- **Per-session drafts.** The composer now saves its content per session — text, manually attached files/folders and pasted images — the moment you switch away, and restores it when you come back; sending clears that session's draft. Previously the text simply stayed in the box across a session switch, so it could be sent to the wrong conversation. Drafts are debounced into the webview state, so they survive a panel reload too (file/folder/session references included).
- **New setting \`dsh.stepCollapse\`: when to auto-collapse a turn's thinking and tool-call groups.** \`end\` (default) folds them as soon as the answer finishes, \`next\` keeps them open until your next message, \`never\` leaves them alone. Auto-collapse goes through the same memory a manual click uses, so a re-render never re-opens what you collapsed. The rows live in 设置 → 发送与输入, and the setting is also in the normal VS Code settings UI.
- **Reasoning translation button (\`cotTranslation\`, 0.2.1 experimental plugin).** When the host composes that plugin, thinking rows grow a small 译 pill: one click translates the reasoning into the interface language and shows it under the original with a "译文" label, with the button flipping to 原文 to hide it again. When the plugin is absent (the default, and what this deployment reports as 404) the button stays hidden — no dead controls. The extension proxies the request with the session id so results are cacheable, and truncates at the host-declared per-request limit.
- Verified with a new 20-check jsdom suite (draft save/restore/clear across switches, persistence, all three collapse modes including turn/end and turn/start boundaries, and the translation flow from hidden capability to rendered translation) plus typecheck, i18n checks (657 keys) and all eight UI suites; the translation UI was also rendered from the real bundle in both palettes.`;

const ENTRY_ZH = `- **按会话草稿**。输入区内容现在按会话保存 —— 文字、手工附件(文件/文件夹)与粘贴的图片都会在切走时存档、切回时还原;发送成功后清掉该会话的草稿。此前切换会话时文字会原样留在框里,有发错会话的风险。草稿去抖写入 webview state,面板重载后同样能恢复(文件/目录/会话引用一并保留)。
- **新设置 \`dsh.stepCollapse\`:工作步骤(思考与工具调用段)的自动收起时机**。\`end\`(默认)回答结束即收起,\`next\` 保持展开直到你发下一条消息,\`never\` 不自动收起。自动收起与手动点击共用同一份记忆,重绘不会把收起的段重新展开。设置行在「设置 → 发送与输入」,同时也出现在 VS Code 原生设置里。
- **思考翻译按钮(\`cotTranslation\`,0.2.1 实验性插件)**。宿主组合了该插件时,思考行末会出现一枚「译」胶囊:点一下把这段思考译成界面语言,以「译文」标签显示在原文下方,按钮变成「原文」可再次收起。插件未组合时(默认情况,本部署实测 404)按钮保持隐藏,不留死控件。扩展侧代理请求并带上会话 id(结果可缓存),并按宿主声明的单次上限截断。
- 验证:新增 20 项 jsdom 夹具(跨会话存稿/还原/清空、持久化、三种收起模式含 turn/end 与 turn/start 边界、翻译从能力隐藏到译文渲染的完整链路)+ typecheck、i18n 校验(657 键)与全部八套界面夹具;翻译界面另用真实包在深/浅两套配色下渲染核对。`;

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
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${ENTRY_EN.trim()}\n${ENTRY_ZH.trim()}\n\n${s.slice(i + marker.length)}` : `${marker}\n\n${ENTRY_EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
