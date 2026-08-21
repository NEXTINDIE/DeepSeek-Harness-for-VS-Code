# Changelog


## 0.12.87
- Dropdown readability & polish: ① declared color-scheme: light dark so native controls (select popups, checkboxes, scrollbars) follow the VS Code theme instead of rendering as a white popup with pale text in dark themes; ② the model/thinking/preset selects (previously background: transparent — the cause of the white popup + near-white text) now use the input background with a subtle border and rounded corners, and their native popup options get explicit background/foreground for guaranteed contrast in every theme; ③ the session dropdown and @/slash menus now set an explicit foreground color on the popup (menu background + theme-aware text) so light-menu themes stay readable.
- 下拉框配色优化:① 声明 color-scheme: light dark,原生控件(下拉弹层/复选框/滚动条)跟随 VS Code 主题,不再出现暗色主题下"白色弹层 + 浅色文字";② 模型/思考/预设下拉(此前 background: transparent —— 正是白底浅字的根源)改用输入框实底背景 + 细边框圆角,原生弹层选项显式设置背景/前景色,任何主题下保证对比度;③ 会话下拉与 @/斜杠菜单弹层显式设置前景色(菜单背景 + 主题感知文字),浅色菜单主题下同样清晰可读。

## 0.12.86
- Adapt to DeepSeek Harness v0.1.1-rc.1: ① ask_user_question answers now support multiline input in the extension (web parity): the custom answer field in question cards and the plan-review inline feedback are multiline textareas with auto-wrap and auto-grow — Enter submits (or moves to the next question), Shift+Enter inserts a newline; ② the new multimodal model DeepSeek-V4-Flash-Vision-Exp appears automatically (server-driven model list); ③ audited the wire contract against 0.1.1-rc.1: session.prompt, ask_user_question, commands/execute (incl. the images parameter), commands/list descriptors, fileReferences, sessionReferenceResolver, and dynamicCordisRunner are all unchanged and compatible — the remaining 0.1.1 changes (composer @-reference layout, Bubblewrap sandbox hardening, Markdown table rendering, cache precision) are web/server-side.
- 适配 DeepSeek Harness v0.1.1-rc.1:① ask_user_question 回答支持多行输入(网页端同款):提问卡自定义回答与计划审批的内联修改意见改为多行输入框,自动换行、自适应高度 —— 回车提交(或进入下一题),Shift+Enter 换行;② 新增多模态模型 DeepSeek-V4-Flash-Vision-Exp 自动出现在模型下拉(服务器驱动);③ 线协议逐项核对 0.1.1-rc.1:session.prompt、ask_user_question、commands/execute(含 images 参数)、commands/list 描述符、fileReferences、sessionReferenceResolver、dynamicCordisRunner 全部兼容;其余 0.1.1 改动(输入框 @ 引用布局、Bubblewrap 沙箱加固、Markdown 表格、缓存精度)均为网页端/服务器侧,无需改动。
## 0.12.85
- @ mention menu polish: ① removed the emoji icons (🤖/📄/💬) from every row for a clean, compact list; ② typing @ now shows a loading listbox right away (web parity) — the Agents group appears instantly from the local scan while "Loading files…" / "Loading sessions…" rows with a CSS spinner fill the Files & folders and Session conversations groups until the server candidates arrive, then the loading rows are replaced in place.
- @ 提及菜单优化:① 移除每行的 emoji 图标(🤖/📄/💬),列表更简洁紧凑;② 输入 @ 立即显示加载列表框(与网页端一致)—— 智能体分组由本地扫描即时出现,「正在加载文件资源…」「正在加载会话列表…」加载行(纯 CSS 旋转圆点)占位,服务器候选到达后原位替换。


## 0.12.84
- @ mention menu now matches the web (rc.8): typing @ opens a grouped picker (Agents / Files & folders / Session conversations) navigable with ↑↓/Enter/Esc: ① file/folder candidates come from the server's fileReferences/list (relative to the session cwd); picking inserts @path (@"quoted" form for paths with spaces; directories keep the trailing slash and stay open to descend, matching the web grammar); ② session candidates come from sessionReferenceResolver/candidates; picking inserts the @[label](dsh-session:…) Markdown mention, which the host pre-step expands into read-only snapshot context on send (no local handling needed); ③ agent mentions keep the original local scan-and-inject behavior; ④ the @ trigger grammar is broadened to the web's (any non-space token plus @"quoted paths"), and the agent-config scan no longer requires a selected session, fixing the empty @ menu; ⑤ fixed the root cause of the missing 'low' reasoning effort: the server was shadowed by the stale direct install (~/.dsh-vscode/server, rc.6) — a new dsh.updateServer command force-reinstalls @deepseek-ai/dsh@latest and restarts, and the UI auto-refreshes model data after the server reconnects.
- @ 提及菜单对齐网页版 rc.8:输入 @ 弹出分组候选列表(智能体 / 文件与文件夹 / Session 对话),支持 ↑↓/Enter/Esc 选择:① 文件与文件夹候选来自服务器 fileReferences/list(相对会话工作目录),选中插入 @路径(含空格的路径用 @"引号" 形式;目录保持尾部斜杠并继续输入下一级,与网页端 grammar 一致);② Session 候选来自 sessionReferenceResolver/candidates,选中插入 @[标题](dsh-session:…) Markdown 提及,发送后由宿主 pre-step 展开为只读会话快照上下文(无需本地处理);③ 智能体候选保持原有本地扫描与注入逻辑;④ 提及触发语法放宽为网页端同款(支持 @任意字符 与 @"带空格路径"),并修复此前仅在已选会话时才扫描智能体目录导致 @ 无候选的问题;⑤ 修复「思考强度 low 缺失」的根源:服务器被 ~/.dsh-vscode/server 的旧版直接安装(rc.6)遮蔽 —— 新增 dsh.updateServer 命令(强制重装 @deepseek-ai/dsh@latest 并重启),服务器重连后自动重推界面数据刷新模型下拉。

## 0.12.83
- Remove the leading ⌘ icon character from every row of the / command menu to reduce popup width and declutter the list (the ⌘ prefix shown for queued commands inside the conversation is unaffected).
- 移除 / 命令列表中每行前的 ⌘ 图标字符,减少弹窗占用、视觉更清爽(会话内排队命令的 ⌘ 前缀显示不受影响)。


## 0.12.82
- Adapt to DeepSeek Harness v0.1.0-rc.8: ① commands/execute now carries an images parameter (rc.8 rejects the call as arguments-invalid when the field is missing, while rc.7 and earlier reject extra fields) — the extension detects the capability from commands/list descriptors (input.images) instead of the version string (host.describe returns a generic 0.0.1 and is unreliable), refreshed automatically on reconnect; ② /goal, /plan and friends now accept image+text input: known commands with images go through the command gateway when supported (the host decides per command declaration and returns an error text for commands that refuse images), otherwise they fall back to the image prompt path so no image is dropped; ③ audited the remaining rc.8 changes (multimodal adapters, subagent Profile Bundles / Codex named instances, PTY, SQLite storage format, concurrent web_search, etc.) — none affect the extension wire contract; session.prompt / session.history / subagent.list match rc.8 exactly.
- 适配 DeepSeek Harness v0.1.0-rc.8:① commands/execute 网关新增 images 参数(rc.8 起缺失该字段会被网关按 arguments-invalid 拒绝,rc.7 及更早则拒绝多余字段)—— 扩展改为通过 commands/list 描述符(input.images)探测能力而非依赖版本号(host.describe 返回通用 0.0.1,不可靠),连接重连时自动刷新;② /goal、/plan 等命令支持图文输入:已知命令 + 图片在支持网关时走命令通道(宿主按命令声明裁决,不接受的命令返回错误文本),旧版网关或未知命令时退回图文 prompt 通道,图片不丢失;③ 核对 rc.8 其余变更(多模态适配器、子代理 Profile Bundle / Codex 命名实例、PTY、SQLite 存储格式、web_search 并发等)均不涉及扩展线协议;session.prompt / session.history / subagent.list 等契约与 rc.8 完全一致。


## 0.12.79
- Fix 'approve in VS Code but the web still shows awaiting approval': the host's activate return value does not include a status field, so the extension's previous check never detected client-pending and never ran the resolveRequestRun settlement after approval — plugins with a Client half stayed client-pending forever with the approval request still open (the web's reconcile treats client-pending as awaiting approval too). Now, after approving or a direct run, the extension confirms the run state from the authoritative inventory and only then settles via resolveRequestRun/settleUserRun (matching the web orchestrator's answer/settleDirect semantics); if approval fails, the approval card is restored for retry.
- 修复 VS Code 中批准 Cordis 插件后网页端仍显示待审批的问题:宿主的 activate 返回值并不包含 status 字段,扩展此前据此判断是否需要在批准后执行 resolveRequestRun 结算,导致含 Client 半段的插件在批准后一直停留在 client-pending、审批请求始终未关闭,网页端(其 reconcile 把 client-pending 也视为待审批)因而持续显示待批准。现在授权/直接运行后以权威清单确认运行状态,确需结算时再调用 resolveRequestRun/settleUserRun(与网页端 orchestrator 的 answer/settleDirect 语义一致);授权失败时审批卡片恢复显示以便重试。


## 0.12.78
- Port the web Cordis dynamic-plugin panel into VS Code: ① in-conversation approval cards — when a plugin requests a run, a 'Cordis plugin approval' card appears in the chat with ✓ Allow this version only / ✓✓ Allow future versions / ✗ Decline (web parity: allowing future versions auto-runs later updates of that plugin); ② a new 'Cordis plugins' panel (command dsh.openCordisPanel / 🧩 header button) listing plugins grouped by current/other sessions with live status (awaiting approval / running / waiting / starting / client pending / failed / stopped…), version list with the current version, and actions run/restart, run an older version, stop, remove (two-step confirm); ③ host/remote-event cordis/* frames are now forwarded so the panel and approval cards refresh in real time; ④ note: the Client half only takes effect in the web GUI (hinted in the panel); after approving in VS Code the host half runs normally.
- 把网页版 Cordis 动态插件面板完整移植到 VS Code:① 会话内浮窗审批卡 —— 插件请求运行时在对话区出现「Cordis 插件审批」卡片,支持 ✓仅允许此版本 / ✓✓允许后续版本 / ✗拒绝,与网页端授权语义一致(允许后续版本后同一插件的更新自动运行);② 新增「Cordis 插件」面板(命令 dsh.openCordisPanel / 聊天头部 🧩 按钮):插件清单按当前/其他会话分组,显示运行状态(待审批/运行中/等待/启动中/Client 待激活/失败/已停止等)、版本列表与当前版本,支持 运行/重启、切换运行旧版本、停止、移除(两步确认);③ 打通 host/remote-event 的 cordis/* 帧转发,面板与审批卡随插件生命周期实时刷新;④ 说明:Client 半段仅在网页端生效(面板中提示),VS Code 内授权后宿主半段正常运行。


## 0.12.77
- Adapt to DeepSeek Harness v0.1.0-rc.7: ① question cards are now collapsible and keep selections, custom answers and the current page when collapsed (web rc.7 parity; drafts survive re-renders); ② the built-in preset English name is renamed Code mode → PTC mode (Chinese stays 编码模式), all language dictionaries synced; ③ the defaultReasoningEffort config description now mentions the new low effort (the server already reports off/low/high/max; the thinking dropdown adapts automatically); ④ audited the remaining rc.7 changes (subagent tasks in the Job Panel, durable MCP/ACP image attachments, max-tokens fix, etc.) — none affect the extension wire contract.
- 适配 DeepSeek Harness v0.1.0-rc.7:① 提问卡片支持折叠/展开,折叠后保留已选选项、自定义输入与当前页码(与网页端 rc.7 一致,草稿跨重渲染保留);② 内置预设英文名 Code mode 更名为 PTC mode(与网页端一致,中文仍为「编码模式」),各语言词典同步;③ 配置项 defaultReasoningEffort 描述补充新增的 low 推理强度(服务器已返回 off/low/high/max 四档,思考下拉自动适配);④ 核对 rc.7 其余变更(子代理任务接入 Job Panel、MCP/ACP 持久化图片、max-tokens 修复等)均不涉及扩展线协议,无需改动。


## 0.12.76
- Fix /undo failing on non-ASCII filenames (Chinese etc.): git now runs with `core.quotepath=false` so paths stay as raw UTF-8 instead of `"\346\265\213..."` escapes; the reverse-apply patch is no longer trimmed (keeps its trailing newline, fixing "corrupt patch"); `git apply` uses `--ignore-whitespace` to survive Windows CRLF. Includes plugin dsh-git-rollback@0.1.7 (13 tests).
- 修复 /undo 对中文等非 ASCII 文件名的失败:git 以 `core.quotepath=false` 运行,路径保持原始 UTF-8(不再变成 `"\346\265\213..."` 转义);反向应用补丁不再被 trim(保留末尾换行,修复 "corrupt patch");`git apply` 加 `--ignore-whitespace` 兼容 Windows CRLF。内置插件升级至 dsh-git-rollback@0.1.7(13 项测试)。

## 0.12.74
- Review dialogs now color-code file rows by change type: added files (A) in green, deleted files (D) in red with strikethrough — applied to rollback preview, turn-undo preview and the checkpoints dialog (binary files use git --name-status to determine add/delete).
- 审核窗口按改动类型着色文件行:新增文件(A)绿色,删除文件(D)红色 + 删除线——覆盖回退预览、回合精确撤销预览与检查点清单弹窗(二进制文件通过 git --name-status 判定增删)。

## 0.12.72
- Fix: "Restore checkpoint" on a turn divider no longer falls back to the last checkpoint when that turn has no record — it now reports "no restorable checkpoint for this turn" instead of showing another turn's changes (e.g. clicking turn A/B no longer previews turn C's diff). Plus Russian (ru) language scaffolding.
- 修复:「还原检查点」点击某个回合的分隔线时,若该回合没有检查点记录,不再错误回退显示最后一个回合的改动(如点 A/B 却显示 C 回合的 23–32 条),而是提示"该回合没有可精确撤销的快照"。附带俄语(ru)语言脚手架。

## 0.12.71
- Fix: turns that started with an unchanged workspace now still get a checkpoint entry (reusing the parent commit), so files created during such a turn are attributed to that turn — "Restore checkpoint" on that turn now previews and undoes them instead of silently folding them into the next turn's snapshot. Includes plugin dsh-git-rollback@0.1.6.
- 修复:回合开始时工作区无改动的情况现在也会记录检查点条目(复用父提交),使该回合内新建的文件归属到该回合——点击该回合的「还原检查点」能预览并撤销它们,不再被静默并入下一回合的快照。内置插件升级至 dsh-git-rollback@0.1.6。

## 0.12.70
- "Restore checkpoint" now matches GitHub Copilot semantics: clicking a turn divider only reverts the files changed by that turn (reverse-applies the turn-start → turn-end diff), leaving files you changed manually, other turns' changes, and your own commits/HEAD untouched — no more whole-workspace rollback.
- 「还原检查点」改为 GitHub Copilot 同款语义:点击回合分隔线**只撤销该回合自身产生的文件改动**(反向应用 回合开始→回合结束 的差异);你手动改的文件、其他回合的改动以及你自己的提交与 HEAD 完全不受影响——不再整体回滚工作区。

## 0.12.69
- Turn-level "Restore checkpoint" dividers (GitHub Copilot style): every turn boundary inside a conversation now shows a horizontal line with a centered 「还原检查点」 button — clicking it previews and restores the workspace to the checkpoint before that turn began. Also fixed forked sessions missing the `session/end-seed` boundary event after they had been active (always pull history on open).
- 回合级「还原检查点」分隔线(GitHub Copilot 同款):同一对话内每个回合边界都显示水平线 + 居中「还原检查点」按钮——点击预览并回退到该回合开始前的检查点。同时修复分叉会话活动过后缺失 `session/end-seed` 边界事件的问题(打开会话时始终拉取历史)。

## 0.12.68
- Turn-level "Restore checkpoint" dividers (GitHub Copilot style): every turn boundary inside a conversation now shows a horizontal line with a centered 「还原检查点」 button — clicking it previews and restores the workspace to the checkpoint before that turn began. Also fixed forked sessions missing the `session/end-seed` boundary event after they had been active (always pull history on open).
- 回合级「还原检查点」分隔线(GitHub Copilot 同款):同一对话内每个回合边界都显示水平线 + 居中「还原检查点」按钮——点击预览并回退到该回合开始前的检查点。同时修复分叉会话活动过后缺失 `session/end-seed` 边界事件的问题(打开会话时始终拉取历史)。

## 0.12.67
- Bundles dsh-git-rollback@0.1.5 (identical code, version reset for the npm release flow); refreshed "model config compatibility" wording in the settings panel (EN + 12 languages).
- 内置插件升级至 dsh-git-rollback@0.1.5(内容与 0.1.4 相同,版本号用于重新对齐 npm 发布流程);设置面板「模型配置兼容」相关文案更新(英文 + 12 语言)。

## 0.12.66
- Fork-point "Restore checkpoint" divider (GitHub Copilot style): when viewing a forked conversation, a horizontal line with a centered 「还原检查点」 button now sits between the parent conversation's messages and the branch's own messages — clicking it restores the workspace to the checkpoint before this conversation began (the fork-point state), with the usual review-and-confirm dialog. The old per-message "Git rollback to before this turn" button was removed. Fallback path restores the parent's last turn-end snapshot via `/rollback <commit>` when the fork happened with a clean workspace. Includes plugin dsh-git-rollback@0.1.4 (checkpoint-SHA restore).
- 分叉点「还原检查点」分隔线(GitHub Copilot 同款):查看分叉会话时,父会话(对话 A)与该分支(对话 B)的消息之间出现一条水平分隔线,中间是「还原检查点」按钮——点击即可把工作区还原到本对话创建前的检查点(分叉时刻状态),带逐文件差异确认弹窗;同时移除了旧的「Git 回退到本回合之前」按钮。分叉时工作区干净(首快照被跳过)的兜底路径会经 `/rollback <commit>` 恢复父会话最后一轮的回合结束快照。内置插件升级至 dsh-git-rollback@0.1.4(支持按检查点提交恢复)。

## 0.12.63
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。

## 0.12.62
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。

## 0.12.61
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。

## 0.12.56
- Produced git-tracked files now open as HEAD → working-tree diffs by default; README intro mentions turn-level Git rollback; fixed the extension repository URL to github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code.
- 产物中的 git 已跟踪文件点击打开时,默认展示 HEAD → 工作树 diff 差异视图;插件介绍(README/简介)补充回合级 Git 回退说明;修正插件仓库地址为 github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code。

## 0.12.55
- New release script tools/release.mjs: automatically generates brief bilingual changelog entries on version bumps, syncing CHANGELOG.md and the extension-changelog agent.
- 新增发布脚本 tools/release.mjs:发版时自动生成中英双语更新日志条目,并同步写入 CHANGELOG.md 与 .dsh/agent/extension-changelog.md 智能体。

## 0.12.53
- 修复:回合进行中不再显示消息操作条(复制/分支/回退/点赞),避免对话被修改期间误操作。
- Fix: message action bar (copy/branch/rewind/feedback) no longer shows while a turn is still running, preventing accidental actions during edits.

## 0.12.52
- 会话下拉默认只展示当前工作目录的对话(Claude Code 同款),可一键切换显示全部。
- The session dropdown shows only conversations in the current workspace folder by default (like Claude Code), with a one-click toggle to show all.

## 0.12.51
- 智能体支持 `@` 手动调用:输入 `@` 自动弹出可用智能体列表(↑↓/Enter/Esc),发送时自动注入智能体定义;`.dsh/agent/*.md` 支持 front matter(name/description)行业约定。
- Agents support `@` mention: typing `@` shows an agent picker (↑↓/Enter/Esc); the agent definition is injected automatically when sending. `.dsh/agent/*.md` follows the industry front-matter convention (name/description).

## 0.12.50
- 优化审批弹窗样式与按钮(对齐网页端):色点条 + 工具徽标 + 原因 + 命令预览,「拒绝 / 允许一次」按钮风格升级。
- Redesigned the approval card and buttons (aligned with the web): status dot strip + tool badge + reason + command preview, with upgraded "Refuse / Allow once" buttons.

## 0.12.49
- 系统提示词卡片样式重做:图标 + 标题 + 注入标签 + 折叠箭头,正文可滚动。
- Redesigned the system-prompt card: icon + title + injection tag + chevron, scrollable body.

## 0.12.48
- 中文预设名称「PTC 模式」更名为「编码模式」。
- Renamed the Chinese preset "PTC 模式" to "编码模式" (matches English "Code mode").

## 0.12.47
- 移除重复的「回退到此处」菜单项(与「从此处新建分支」冲突)。
- Removed the duplicate "Rewind to here" menu item (conflicted with "Branch from here").

## 0.12.46
- 计划文件改为 Markdown 格式并优化命名(优先会话标题,如 `plan-xxx.md`),重启后可重新打开继续查看/修改。
- Plan files are now Markdown with readable names (session title preferred, e.g. `plan-xxx.md`); they can be reopened after restart for review/editing.

## 0.12.45
- 计划审批文本以纯文本等宽样式生成,并纳入产物列表;`.dsh/plans/` 持久化。
- Plan review text is generated in plain monospace style and included in the deliverables list; persisted under `.dsh/plans/`.

## 0.12.44
- 计划审批弹窗按钮与网页端对齐(去聊天里说 / 拒绝 / 确认执行),支持审批内直接输入修改意见。
- Plan review buttons match the web (Chat about it / Refuse / Approve), with inline feedback input.

## 0.12.43
- 提问卡片重构为网页端分页流:单选序号圆点 / 多选复选框、自定义回答输入、跳过与提交同排。
- Question cards rebuilt as the web's paged flow: numbered radio dots / checkboxes, custom answer input, skip and submit in one row.

## 0.12.42
- 计划模式修复:`/plan` 为进入、`/plan off` 为退出;切换/新建会话时清空旧会话状态,避免计划模式误继承。
- Plan mode fix: `/plan` enters and `/plan off` exits; stale plan/goal state is cleared on session switch/new session.

## 0.12.41
- 会话下拉升级为富文本列表:未读绿点、待审批 / 等待回答 / 运行中徽标,点击会话消除未读。
- Session dropdown upgraded to a rich list: unread dots, pending-approval / awaiting-answer / running badges; selecting a session clears its unread mark.

## 0.12.40
- 新增 `.dsh` 项目目录约定:`.dsh/agent`(智能体)、`.dsh/skills`(技能)、`.dsh/memory`(记忆)扫描与 `/` 菜单展示。
- Added `.dsh` project conventions: scanning of `.dsh/agent` (agents), `.dsh/skills` (skills), `.dsh/memory` (memory) surfaced in the `/` menu.

## 0.12.17 – 0.12.39(major improvements)
- 对话渲染对齐网页端:思考进行中自动展开、结束后收起;工具调用内联在所属思考块之后。
- Conversation rendering matches the web: reasoning auto-expands while thinking and collapses after; tool calls render inline after their thinking block.
- 产物卡与网页端 ProducedFiles 一致(工具视图推导,≤6 条 + 折叠,点击在 VS Code 打开)。
- Deliverables match the web's ProducedFiles (derived from tool views, ≤6 rows + collapse, click to open in VS Code).
- 内置 Agent 预设多语言化(标准/编码/极简/创造模式)。
- Built-in agent presets are fully localized (Standard/Code/Minimal/Creator modes).
- 会话统计行固定在输入框底部、始终可见(投影缺失时由事件推导)。
- Session stats bar is pinned at the bottom of the input area and always visible (derived from events when the projection is missing).
- 输入框布局:提示语独立一行、思考选择器移至右上角、计划/目标芯片同行。
- Composer layout: hint on its own line, thinking selector moved to the top-right, plan/goal chips in one row.
- 旋转动画的运行中指示(⏳)。
- Spinning ⏳ animation for running indicators.
- 全量多语言支持(14 种语言,界面 + 设置 + 预设)。
- Full multilingual support (14 languages: UI + settings + presets).


## 0.12.74
- Review dialogs now color-code file rows by change type: added files (A) in green, deleted files (D) in red with strikethrough — applied to rollback preview, turn-undo preview and the checkpoints dialog (binary files use git --name-status to determine add/delete).
- 审核窗口按改动类型着色文件行:新增文件(A)绿色,删除文件(D)红色 + 删除线——覆盖回退预览、回合精确撤销预览与检查点清单弹窗(二进制文件通过 git --name-status 判定增删)。


## 0.12.75
- Fix 'Steer now' on queued messages: ① the steer button is now only enabled while the agent is running (web parity; disabled with an explanatory tooltip after the turn ends/cancel/error); ② clear feedback on accepted steers (handled right after the current response) and actionable notice when the turn no longer accepts steering; silent convergence when the item was already claimed; ③ fix the running indicator wrongly clearing when queued messages remain after a turn; ④ add the missing Arabic package.nls key and remove its BOM.
- 修复排队消息「插队」失效问题:① 插队按钮仅在 agent 运行中可用(与网页端 disabled:!running 一致,回合已结束/取消/出错后禁用并给出提示);② 插队成功给出明确反馈(将在当前回答结束后优先处理),回合结束不可插队时给出可操作提示,消息已被开始处理时静默收敛;③ 修正回合结束但仍有排队消息时运行状态误判为停止的问题;④ 补齐阿拉伯语 package.nls 缺失键并移除 BOM。


## 0.12.73
- Added Russian (ru) support: 446 UI dictionary entries + 160 host l10n strings + 53 contribution-point strings fully translated; the settings language picker, dsh.language enum, and README language list now include Русский.
- 新增俄语(ru)支持:446 条界面词典 + 160 条宿主 l10n + 53 条贡献点文案全部译毕;设置面板语言选择器、dsh.language 枚举、README 语言清单同步加入 Русский。


## 0.12.68
- Filled all missing translations using Chinese as the source: +61 keys per language in the 11 UI dictionaries (permission presets / subagent catalog / deliverables / settings namespaces & fields / tool-dir compatibility) and +5 per language in the l10n bundles (command notices / plan review header) — 726 entries total; audit confirms 0 missing across all three dictionary sets.
- 按中文为源语言补齐全部语言的缺失条目:11 种语言词典各补 61 个键(权限预设/子代理目录/产物/设置命名空间与字段/工具目录兼容等),l10n bundle 各补 5 个键(命令执行/计划审批头等),合计 726 条;审计确认三组词典全部 0 缺失。


## 0.12.65
- Archiving a session no longer activates sessions from other workspace folders: the next session is picked only within the current folder (or the dropdown returns to " — Select session —\);
- 归档会话后不再激活其他工作目录的会话:仅从当前工作目录内选择下一个会话,目录内无会话则回到「— 选择会话 —」;目录过滤开启时下拉列表严格只显示当前目录的会话(不再特殊保留其他目录的当前会话)。


## 0.12.64
- Commit-message generation no longer activates a session in the conversation list: the one-shot session is archived immediately and the user's previous current session is restored — generation runs fully in the background (progress in a notification), never disturbing the session dropdown.
- 生成 git 提交信息时不再激活到对话列表:一次性会话创建后立即归档,并恢复用户原当前会话 —— 生成全程在后台进行(进度走通知气泡),不打断、不污染会话下拉列表。


## 0.12.63
- On workspace-folder switch or extension activation, no session is auto-selected: the dropdown stays at " — Select session —\
- 切换工作区目录或扩展激活时不再主动选择/切换会话:下拉框保持「— 选择会话 —」占位,由用户主动选择;若当前会话不属于新目录仅取消选择(不再自动切到该目录最近会话)。


## 0.12.62
- Typing / now immediately shows the main command list (plan on/off, goal, compact, feedback, permission, rollback, redo, checkpoints), with skills and .claude commands appended when a filter word is typed; switching workspace folders auto-isolates sessions — a current session outside the new folder is replaced by that folder's latest session (or none), preventing cross-folder confusion.
- 输入 / 立即弹出主要命令列表(计划模式/退出、设置目标、压缩上下文、反馈、权限、回退、重做、检查点),输入过滤词后追加技能与 .claude 命令;切换工作区目录时自动对话隔离 —— 当前会话不属于新目录则切到该目录最近会话,无会话则取消选择,避免跨目录误显运行中对话。


## 0.12.60
- Local skills (.claude/.codex) now behave like all skills: picking inserts a /name token (expanded on send, no full-text dump into the input); typing / auto-completes commands and skills (plan mode, skills, .claude commands; ↑↓/Enter/Esc).
- .claude / .codex 等本地技能与所有技能统一:点击插入 /名称 token(发送时由扩展展开正文,不再整文塞入输入框);输入 / 时自动弹出命令与技能补全(计划模式、技能、.claude 命令等,↑↓/Enter/Esc 选择)。


## 0.12.59
- Answered why global skills still appear with only .claude enabled: the available-skills list now shows source tags and a new " DSH user skills\
- 回答「只启用 .claude 仍显示全局技能」:可用技能列表新增来源标注(全局/内置等)与「DSH 用户技能」开关 —— 关闭后 ~/.dsh/skills、~/.agents/skills 与自定义目录的技能不再显示。


## 0.12.58
- Rollback-review diffs now render git-style with line numbers (added=green, removed=red, header/hunk highlights); the agent-config-dirs toggles now govern both project and user-global config dirs (e.g. disabling codex skips ~/.codex and the project .codex).
- 回退审核的「查看差异」改为 git 风格:带行号,新增行标绿、删除行标红,文件头/hunk 头高亮;智能体配置目录开关现在同时控制项目目录与用户全局目录(如禁用 codex 后 ~/.codex 与项目 .codex 都不再读取展示)。


## 0.12.56
- Produced git-tracked files now open as HEAD → working-tree diffs by default; README intro mentions turn-level Git rollback; fixed the extension repository URL to github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code.
- 产物中的 git 已跟踪文件点击打开时,默认展示 HEAD → 工作树 diff 差异视图;插件介绍(README/简介)补充回合级 Git 回退说明;修正插件仓库地址为 github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code。


## 0.12.55
- New release script tools/release.mjs: automatically generates brief bilingual changelog entries on version bumps, syncing CHANGELOG.md and the extension-changelog agent.
- 新增发布脚本 tools/release.mjs:发版时自动生成中英双语更新日志条目,并同步写入 CHANGELOG.md 与 .dsh/agent/extension-changelog.md 智能体。


## 0.12.53
- 修复:回合进行中不再显示消息操作条(复制/分支/回退/点赞),避免对话被修改期间误操作。
- Fix: message action bar (copy/branch/rewind/feedback) no longer shows while a turn is still running.

## 0.12.52
- 会话下拉默认只展示当前工作目录的对话(Claude Code 同款),可一键切换显示全部。
- The session dropdown shows only conversations in the current workspace folder by default.

## 0.12.51
- 智能体支持 `@` 手动调用:输入 `@` 自动弹出可用智能体列表,发送时自动注入智能体定义;`.dsh/agent/*.md` 支持 front matter 行业约定。
- Agents support `@` mention: typing `@` shows an agent picker; the agent definition is injected when sending.

## 0.12.50
- 优化审批弹窗样式与按钮(对齐网页端):色点条 + 工具徽标 + 原因 + 命令预览,「拒绝 / 允许一次」按钮升级。
- Redesigned the approval card/buttons (aligned with the web): status dot strip + tool badge + reason + command preview.

## 0.12.49
- 系统提示词卡片样式重做:图标 + 标题 + 注入标签 + 折叠箭头,正文可滚动。
- Redesigned the system-prompt card: icon + title + injection tag + chevron, scrollable body.

## 0.12.48
- 中文预设「PTC 模式」更名为「编码模式」。
- Renamed the Chinese preset "PTC 模式" to "编码模式".

## 0.12.47
- 移除重复的「回退到此处」菜单项。
- Removed the duplicate "Rewind to here" menu item.

## 0.12.46
- 计划文件改为 Markdown 并优化命名(优先会话标题),重启后可重新打开。
- Plan files are now Markdown with readable names; reopenable after restart.

## 0.12.45
- 计划审批文本以纯文本等宽样式生成并纳入产物列表;`.dsh/plans/` 持久化。
- Plan review text is plain monospace, included in deliverables, persisted under `.dsh/plans/`.

## 0.12.44
- 计划审批按钮与网页端对齐(去聊天里说 / 拒绝 / 确认执行),支持审批内输入修改意见。
- Plan review buttons match the web; inline feedback input supported.

## 0.12.43
- 提问卡片重构为网页端分页流:单选序号圆点 / 多选复选框、自定义回答、跳过与提交同排。
- Question cards rebuilt as the web's paged flow with checkboxes, custom answers, skip/submit in one row.

## 0.12.42
- 计划模式修复:`/plan` 进入、`/plan off` 退出;切换会话清空旧状态。
- Plan mode fix: `/plan` enters, `/plan off` exits; stale state cleared on switch.

## 0.12.41
- 会话下拉升级为富文本列表:未读绿点、待审批 / 等待回答 / 运行中徽标。
- Session dropdown upgraded: unread dots, pending/running badges.

## 0.12.40
- 新增 `.dsh` 项目目录约定:`.dsh/agent`(智能体)、`.dsh/skills`(技能)、`.dsh/memory`(记忆)扫描与 `/` 菜单展示。
- Added `.dsh` project conventions: agents/skills/memory scanned and shown in the `/` menu.

## 0.12.17 – 0.12.39(major improvements)
- 对话渲染对齐网页端:思考自动展开/收起;工具调用内联在思考块之后;产物卡 ProducedFiles 同款。
- Conversation rendering matches the web: reasoning expand/collapse, inline tool calls, ProducedFiles-style deliverables.
- 内置 Agent 预设多语言化;统计行固定输入框底部;思考选择器移至右上角;⏳ 旋转运行指示;14 种语言。
- Localized presets, pinned stats bar, top-right thinking selector, spinning ⏳ running indicator, 14 languages.
