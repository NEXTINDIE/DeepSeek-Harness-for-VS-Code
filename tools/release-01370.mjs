// 发布 0.13.70:兼容 dsh v0.2.2-rc.2 / rc.3(子代理、账号、继续生成、具名 AgentTeam)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.69";

const EN = `## 0.13.70
- **Adapted to dsh v0.2.2-rc.2 and v0.2.2-rc.3.** Mechanical diff of the published packages: endpoints **224 → 256** (37 added, 5 removed, 2 changed), forwarded events **25 → 26**, session projections **25 → 27**. rc.3 itself only adds the experimental DeepSeek chat-import plugin and a Windows desktop updater fix; rc.2 is the substantive release. The extension's core endpoints (session, model, workspace, schedule, feedback, settings, goals) keep their signatures.
- **Subagent control follows the rc.2 contract.** \`subagents/interruptByParent\` was removed; the extension now calls \`subagents/interruptByUser(childSessionId)\` and falls back to the old endpoint on older hosts. \`subagents/prompt\` dropped \`parentSessionId\` and \`mode\`; the new body is sent first, and \`gateway/input-invalid\` / argument mismatches fall back to the legacy body (and then to the pre-0.1.5 body without \`delivery\`). Named subagents now show the host-provided \`name\`, falling back to the creation label.
- **Account status and sign-in work again on rc.2+.** \`account/watch\` now emits \`AccountUpdate { type, state }\` instead of a bare view; the extension unwraps \`state\` while still accepting the old shape. \`account/startSignIn\` requires client metadata, a loopback \`callbackOrigin\` and \`loginSource\`; \`cancelSignIn\` requires the attempt id and \`signOut\` requires client metadata. The previous empty-argument calls could never satisfy the host descriptor. The sign-in flow now starts with the correct metadata, opens the browser when the \`authorizeUrl\` arrives (start may only return \`initializing\`), and opens each attempt at most once.
- **New: Continue generating (rc.2).** The host exposes an eligible failed turn through the \`conversationContinuation\` projection. A **Continue generating** button appears above the composer when the session is idle and the projection is non-null; it sends the host's empty-content prompt semantics to retry the turn, then hides. It is localized in all 12 webview languages and stays hidden while running or when no eligible failure exists.
- **Optional rc.2/rc.3 surfaces** (account notifications, AgentTeam task board, host worktree projection, web search provider picker, file search, terminal/MCP/OfficeKit panels, chat import) are additive composition packages; when a deployment does not mount them the extension skips them instead of failing. The wire header records this corridor.
- **Verified**: live 0.2.2-rc.3 server — 6/6 (account watch unwrap, sign-in/cancel with metadata, new subagent interrupt/prompt shapes, continuation prompt shape); 0.2.1-rc.2 fallback — 3/3 (legacy subagent prompt/interrupt and account sign-in); webview continuation — 6/6; existing automation regression 21/21, per-session model regression 7/7, \`tsc --noEmit\` and the production build.`;

const ZH = `- **适配 dsh v0.2.2-rc.2 与 v0.2.2-rc.3**。对已发布包机械 diff:端点 **224 → 256**(新增 37、移除 5、变化 2),转发事件 **25 → 26**,会话投影 **25 → 27**。rc.3 本身只新增实验性 DeepSeek 会话导入插件与 Windows 桌面更新修复,rc.2 才是实质变更版本。扩展使用的核心端点(会话、模型、工作区、定时任务、反馈、设置、目标)签名不变。
- **子代理控制跟随 rc.2 契约**。\`subagents/interruptByParent\` 已移除,改为 \`subagents/interruptByUser(childSessionId)\`,老宿主自动回退旧端点;\`subagents/prompt\` 去掉 \`parentSessionId\` / \`mode\`,先发新请求体,\`gateway/input-invalid\` 或参数不匹配时回退旧请求体(再回退到 0.1.5 之前不带 \`delivery\` 的版本)。具名子代理优先显示宿主目录里的 \`name\`,缺失时回退创建标签。
- **rc.2+ 账号状态与登录恢复可用**。\`account/watch\` 帧从裸视图改为 \`AccountUpdate { type, state }\`,扩展解包 \`state\`,同时兼容旧宿主;\`account/startSignIn\` 要求客户端元数据 + loopback \`callbackOrigin\` + \`loginSource\`,\`cancelSignIn\` 要 attempt id,\`signOut\` 要客户端元数据 —— 原先的空参数调用永远无法满足宿主描述符。现在登录会用正确元数据发起,并在 \`authorizeUrl\` 到达时打开浏览器(发起时可能只返回 \`initializing\`),同一 attempt 只打开一次。
- **新增:继续生成(rc.2)**。宿主通过 \`conversationContinuation\` 投影标记可继续的失败回合;会话空闲且投影非空时,输入框上方出现「继续生成」按钮,按宿主的空内容 prompt 语义重试,随后隐藏。12 种界面语言均已本地化;运行中或没有可继续回合时自动隐藏。
- **rc.2/rc.3 的可选界面**(账号通知、AgentTeam 任务板、Host 工作树投影、Web 搜索提供方选择、文件搜索、终端/MCP/OfficeKit 面板、会话导入)属于可选组合包;部署未挂载时扩展跳过而不报错。wire 类型头已记录该走廊。
- **验证**:真实 0.2.2-rc.3 服务器 6/6(账号 watch 解包、带元数据登录/取消、新子代理打断/追问形状、继续生成请求形状);0.2.1-rc.2 回退 3/3(旧子代理追问/打断、账号登录);webview 继续生成 6/6;既有自动化回归 21/21、每会话模型回归 7/7、\`tsc --noEmit\` 与生产构建通过。`;

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
