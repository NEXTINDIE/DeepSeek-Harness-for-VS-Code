# Changelog

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
