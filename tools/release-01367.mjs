// 发布 0.13.67:适配 0.2.2-rc.1 + 宿主级自动化任务 + 完整会话 Markdown 导出。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.66";

const EN = `## 0.13.67
- **Adapted to dsh v0.2.2-rc.1.** A mechanical diff of the published packages plus a live run against a real rc.1 server: endpoints **173 → 224** (53 added, 2 removed, 2 changed), forwarded events **23 → 25**, session projections **21 → 25**, and the **60 session-event types are identical**. The removed endpoints are \`schedule/delete\` and \`schedule/update\`; the changed ones are \`schedule/list\` (array → page object) and \`session/page\` (its result gains a top-level \`cursor\` and is now an alias of the new \`session/events\`). \`modelSelection\` moved package declaration but keeps its key. The other new endpoints (forge/worktrees, liveshare, plugin details, action cards, session observation/wait, tool-result watch) belong to optional compositions and are skipped when absent.
- **Automation tasks became host-level tasks (0.2.2) without breaking older hosts.** The ⏰ panel can now **create** a task (name, prompt, one-shot delay / absolute time / fixed interval / daily / weekly / cron / RRULE, and a target session, a session created on first delivery, or a new session per run), **edit** it, **pause / resume**, **run now**, **delete**, and **clear all ended tasks**; list/detail show \`active | paused | ended\`, the delivery target, running state, delivery floor, created/updated times and the new history facts (retention, earlier records unavailable). Edits and deletes send the entry's \`updatedAt\` as a CAS token, and a conflict refreshes the list instead of overwriting a concurrent edit. On 0.1.7–0.2.1 the panel stays read-only (delete + history) and reports the older API. This also fixes the old \`schedule/delete\` / \`schedule/history\` envelope: both take a \`request\` wrapper, which the previous flat payload never satisfied.
- **Copy the full conversation as Markdown.** The session ⋯ menu gains the 0.2.2 export: session ID, working directory, export time, then the user and assistant text in order — ready to paste into an issue or a doc.
- **Live model-catalog refresh.** \`llm/models-updated\` now re-reads the current session's model catalog and re-pushes the model pills without interrupting a running turn.
- **Bundled \`dsh-git-rollback\` 0.1.13.** The auto-installer now copies \`icon.svg\` and \`locale/*.json\` as well, because the 0.2.2 plugin manager reads them for rich detail/localized titles; previously it only copied \`lib\` and \`package.json\`, so the loaded plugin logged \`Plugin metadata ... icon.svg ENOENT\`. The plugin's own host APIs (\`session/event\`, \`commands.register\`, \`workingDirectory.get\`, \`webServer.register\`) are unchanged in 0.2.2; it loads and reports \`fiberPhase: active\` on a real rc.1 host.
- **Verified**: 17/17 contract probes and 8/8 hub probes against a live 0.2.2-rc.1 server (auth, session API, schedule create/view/pause/resume/run/history/delete/CAS conflict), 4/4 fallback probes against 0.2.1-rc.2 (v1 detection, read-only delete/history envelopes), 21/21 webview regression checks (v2/v1 panel, create/edit/pause/resume/run/history, validation, Markdown export), plus \`tsc --noEmit\` and the production build.`;

const ZH = `- **适配 dsh v0.2.2-rc.1**。对已发布包机械 diff,并用真实 rc.1 服务器实机核对:端点 **173 → 224**(新增 53、移除 2、变化 2),转发事件 **23 → 25**,会话投影 **21 → 25**,**60 条会话事件词表完全一致**。移除的是 \`schedule/delete\` 与 \`schedule/update\`;变化的是 \`schedule/list\`(数组 → 分页对象)与 \`session/page\`(结果增加顶层 \`cursor\`,成为新 \`session/events\` 的兼容别名)。\`modelSelection\` 只是换了声明包,键仍在。其余新端点(变更请求/工作树、liveshare、插件详情、action cards、会话观察/wait、toolResults/watch)属于可选组合包,未组合时扩展按「不可用」跳过。
- **自动化任务升级为宿主级任务(0.2.2),同时不破坏老宿主**。⏰ 面板现在可**新建**(名称、提示词、一次性延迟 / 指定时刻 / 固定间隔 / 每天 / 每周 / Cron / RRULE,目标可选现有会话、首次投递时新建会话、每次运行新建会话)、**编辑**、**暂停/继续**、**立即运行**、**删除**、**一次清除全部已结束任务**;列表/详情显示 \`active | paused | ended\`、投递目标、运行状态、投递下限、创建/修改时间,以及新的历史事实(保留策略、更早记录不可用)。编辑与删除会把条目的 \`updatedAt\` 作为 CAS 令牌,冲突时刷新列表而不是覆盖别人的并发修改。0.1.7–0.2.1 老宿主保持只读(删除 + 历史)并说明原因。同时修复了旧 \`schedule/delete\` / \`schedule/history\` 的请求信封:两者都要求 \`request\` 包装,旧的扁平载荷从未满足。
- **完整会话导出为 Markdown**。会话 ⋯ 菜单新增 0.2.2 同款导出:会话 ID、工作目录、导出时间,再按顺序导出用户与助手正文,可直接贴进 issue 或文档。
- **模型目录实时刷新**。\`llm/models-updated\` 会重读当前会话的模型目录并重推模型胶囊,不打断正在进行的回合。
- **随包分发的 \`dsh-git-rollback\` 0.1.13**。自动安装器现在同时复制 \`icon.svg\` 与 \`locale/*.json\`——0.2.2 插件管理器会读取它们做富文本详情与本地化标题;此前只复制 \`lib\` 与 \`package.json\`,已加载的插件会报 \`Plugin metadata ... icon.svg ENOENT\`。插件使用的宿主 API(\`session/event\`、\`commands.register\`、\`workingDirectory.get\`、\`webServer.register\`)在 0.2.2 未变;真实 rc.1 宿主上已确认加载且 \`fiberPhase: active\`。
- **验证**:真实 0.2.2-rc.1 服务器 17/17 契约探针 + 8/8 hub 探针(认证、会话 API、任务 新建/查看/暂停/继续/运行/历史/删除/CAS 冲突),0.2.1-rc.2 上 4/4 回退探针(v1 识别、只读删除/历史信封),webview 回归 21/21(v2/v1 面板、新建/编辑/暂停/继续/运行/历史、校验、Markdown 导出),外加 \`tsc --noEmit\` 与生产构建。`;

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
