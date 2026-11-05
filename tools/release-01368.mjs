// 发布 0.13.68:为 0.2.2 新界面补齐 12 种语言,并修复会话菜单语言切换。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.67";

const EN = `## 0.13.68
- **All new 0.2.2 UI is localized.** The host-level automation-task panel (buttons, statuses, form labels, validation and notices), the Markdown-export menu entry and its user/assistant headings are now translated in every webview dictionary: Traditional Chinese, Japanese, Korean, German, French, Spanish, Portuguese, Thai, Indonesian, Turkish, Russian and Arabic. Nothing falls back to English for these surfaces any more.
- **The extension description is localized too.** All 13 \`package.nls\` bundles now mention host-level automation tasks (create/edit/pause/run) and full-conversation Markdown export alongside the existing feature list.
- **Language switching now refreshes the new session-menu item.** The Markdown-export entry is created with the other session-menu buttons before \`init\`; \`applyStaticLabels\` now relabels it, so a Japanese/Chinese/German/… UI no longer keeps the pre-init Chinese label.
- **Verified**: a new localized render check boots the real bundle in all 12 languages and asserts the automation panel, its detail actions, the session-menu entry and the exported Markdown headings; 12/12 pass. The existing 21/21 automation regression, \`tsc --noEmit\` and the production build also pass.`;

const ZH = `- **0.2.2 新界面全部本地化**。宿主级自动化任务面板(按钮、状态、表单字段、校验与提示)、Markdown 导出菜单项及其「用户 / 助手」标题,现已在全部 webview 词典中翻译:繁体中文、日语、韩语、德语、法语、西班牙语、葡萄牙语、泰语、印尼语、土耳其语、俄语、阿拉伯语。这些界面不再回退英文。
- **扩展描述同步本地化**。全部 13 份 \`package.nls\` 现在都在原有功能列表之外,写入了宿主级自动化任务(新建/编辑/暂停/立即运行)与完整会话 Markdown 导出。
- **语言切换会刷新新增的会话菜单项**。Markdown 导出项与其他会话菜单按钮一样在 \`init\` 之前创建;\`applyStaticLabels\` 现在会重新标注它,日语/中文/德语等界面不会再残留初始化前的中文。
- **验证**:新增的本地化渲染测试用真实构建产物在 12 种语言下启动,断言自动化面板、详情操作、会话菜单项与导出 Markdown 的标题;12/12 通过。既有 21/21 自动化回归、\`tsc --noEmit\` 与生产构建同样通过。`;

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
