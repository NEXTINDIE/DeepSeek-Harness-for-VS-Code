// 发布 0.13.43:计划审阅与计划模式对齐 0.2.1(dsh-plan-mode / PlanPreview)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.42";
const ENTRY_EN = `## 0.13.43
- **Plan review aligned with the 0.2.1 host and the Web \`PlanPreview\`.** The plan-mode chip is now driven by the host's \`plan\` projection instead of only the transient \`plan/mode\` event: the effective state is folded exactly like the Web \`PlanChip\` (\`pending ? !active : active\`), so a just-sent \`/plan\` shows "Plan mode (switching…)" and the chip survives a reload or a session switch. That last part was a real defect — the init path never re-rendered the chips, so the chip only appeared after the next event.
- The plan card gained the Web UI's two secondary entrances: **View full text** opens a full-page preview (rendered Markdown, 14px at 1.75 line-height, its own scroll area, Esc or backdrop to close, \`打开计划文件\` when the plan was persisted to \`.dsh/plans/\`), and the card itself keeps a compact scrollable body. Code blocks and tables inside both views now get their own boxes instead of collapsing into body text.
- **Close-review-to-comment** follows the 0.2.1 behaviour ("closing the plan review to add comments ends the turn and waits for feedback, without another model call"): a new \`关闭审阅,去补充意见\` action cancels the review, drops the card, focuses the composer and says the agent is waiting — instead of forcing you to type into the card's inline field. Approve (\`确认执行\`) and \`拒绝\` still submit the host's own option labels, and the inline \`输入修改意见\` field still answers within the card.
- Verified with a 15-case jsdom suite over the real bundle (projection→chip folding, both header entrances, preview open/Esc, close→cancel+focus, approve/reject payloads) plus rendered screenshots in both themes; all earlier suites, typecheck and the three-layer i18n check still pass.`;

const ENTRY_ZH = `- **计划审阅对齐 0.2.1 宿主与网页端 \`PlanPreview\`**。计划模式芯片改由宿主的 \`plan\` 投影驱动(不再只看 \`plan/mode\` 瞬时事件):有效态与网页端 \`PlanChip\` 同一折算(\`pending ? !active : active\`),所以刚发出 \`/plan\` 时显示「计划模式(切换中…)」,而且重载或切换会话后芯片仍在。最后这点是真实缺陷 —— init 路径没有重画模式芯片,之前要等下一条事件才会出现。
- 计划卡补上网页端那两个次级入口:**查看全文** 打开整页预览(渲染后的 Markdown、14px/1.75 行高、独立滚动区,Esc 或点遮罩关闭;计划已落盘到 \`.dsh/plans/\` 时提供 \`打开计划文件\`),卡片内仍保留紧凑的可滚动正文。卡片与预览里的代码块、表格现在各有自己的盒子,不再塌成正文。
- **关闭审阅去补充意见** 跟随 0.2.1 的新行为(「关闭计划审阅以补充修改意见时,直接结束当前轮次并等待用户反馈,避免额外调用模型」):新增 \`关闭审阅,去补充意见\` 动作,取消审阅、收起卡片、把焦点交给输入框并提示 Agent 正在等待 —— 不必再往卡片内的小输入框里挤。\`确认执行\` 与 \`拒绝\` 仍提交宿主自己给出的选项文案,卡片内的 \`输入修改意见\` 也仍可用。
- 验证:针对真实包写了 15 项 jsdom 夹具(投影→芯片折算、两个头部入口、预览打开/Esc、关闭→取消+聚焦、批准/拒绝载荷),并产出深色/浅色两套渲染图;既有全部夹具、typecheck 与三层 i18n 校验仍通过。`;

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
