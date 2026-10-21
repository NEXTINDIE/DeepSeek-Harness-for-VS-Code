// 发布 0.13.58:菜单/芯片去彩色 emoji + 计划模式提示修复。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.57";
const ENTRY_EN = `## 0.13.58
- **No more coloured emoji in the composer menus or the mode chips.** The attachment menu (添加文件 / 添加文件夹 / 添加图片), the whole + command list (计划模式, 压缩上下文, 设置目标, 记录反馈, 列出/运行/更新/停止/删除插件, 技能, 智能体, 记忆) and the 计划模式 / 目标 chips now draw line icons from the shared set — nine new glyphs (plan, target, comment, compress, play, pause, lock, unlock, check-adjacent) were added for the ones the set was missing. Chips strip the leading emoji from their localized text at render time, so no dictionary churn and every language benefits. Permission entries (只读 / 工作区可写 / 完全访问) use the lock, pencil and warning glyphs instead of 🔒/🖊️/⚠️.
- **Fixed: entering plan mode could leave no 计划模式 chip.** Two causes. (1) \`init\` assigned the plan projection and then unconditionally reset the local flag later in the same handler, so a reload or session switch dropped the chip; it now only resets when the host sent no projection. (2) When the host applies \`/plan\` without emitting a projection frame (or before it arrives), nothing updated the UI — sending \`/plan\` or \`/plan off\` now updates the chip optimistically, and the host's projection still overwrites it when present.
- Verified: typecheck, 687 keys with nothing missing, and all twelve UI suites (plan mode, 0.2.1 features, history, images, attachments, compaction, stats, session UX, worktree/account, settings fixes, settings form, deliverables).`;

const ENTRY_ZH = `- **输入区菜单与模式芯片里的彩色 emoji 全部改为线描图标**。附件菜单(添加文件 / 添加文件夹 / 添加图片)、整张 + 命令清单(计划模式、压缩上下文、设置目标、记录反馈、列出/运行/更新/停止/删除插件、技能、智能体、记忆)以及「计划模式 / 目标」芯片都改用共享图标集绘制;为此补齐了九个图形(plan、target、comment、compress、play、pause、lock、unlock 等)。芯片在渲染时剥掉本地化文案开头的 emoji,不必改词条,所有语言一并受益。权限条目(只读 / 工作区可写 / 完全访问)改用锁、铅笔、警告图形,不再用 🔒/🖊️/⚠️。
- **修复:进入计划模式后可能不显示「计划模式」芯片**。两个原因:(1) \`init\` 先按 \`plan\` 投影赋值,随后又在同一处理器里无条件把本地标志清零,导致重载或切会话后芯片消失 —— 现在只有宿主没送投影时才清零;(2) 宿主执行 \`/plan\` 但没发投影帧、或投影还没到时,界面没有任何更新 —— 发送 \`/plan\` / \`/plan off\` 现在会先乐观更新芯片,宿主投影到达后仍以投影为准。
- 验证:typecheck、687 个键无缺失,以及全部十二套界面夹具(计划模式、0.2.1 功能、历史、图片、附件、压缩、统计、会话交互、工作树/账号、设置修复、设置表单、交付卡)。`;

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
