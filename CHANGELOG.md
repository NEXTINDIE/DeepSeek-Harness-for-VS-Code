# Changelog

## 0.13.18
- Fix the VS Code tunnel dropping abruptly around a DSH browser handoff: "Open in browser" (command palette and panel button) no longer hands the bare loopback URL `http://127.0.0.1:3080/?token=…` to `vscode.env.openExternal`. A loopback URL forces VS Code to publish that port from the host so the client can reach it — the built-in "Local Tunnel Port Forwarding" extension does that by running `code tunnel forward-internal --provider github`, which shares the CLI singleton in `~/.vscode/cli` with a `code tunnel` the user already has running ("Shutting down: RPC client requested a tunnel restart") and takes it down. The URL now goes through `vscode.env.asExternalUri` first, so the current client resolves it (client-side port forwarding for desktop/remote windows, the host's own proxy for code-server) and no extra tunnel is created; the launch token is preserved and the resolved URL is logged as `[browser] client URL …` (token redacted).
- 修复浏览器交接会让 VS Code 隧道突然中断:命令面板与面板按钮的「在浏览器中打开」不再把回环地址 `http://127.0.0.1:3080/?token=…` 直接交给 `vscode.env.openExternal` —— 回环地址会迫使 VS Code 在宿主机上把该端口对外发布,内置的 Local Tunnel Port Forwarding 为此执行 `code tunnel forward-internal --provider github`,它与用户已在运行的 `code tunnel` 共用 `~/.vscode/cli` 单例("Shutting down: RPC client requested a tunnel restart"),隧道随即断开。现在先经 `vscode.env.asExternalUri` 由当前客户端解析(桌面/远程窗口走客户端本地端口转发,code-server 走宿主自己的代理),不再额外建隧道;启动 token 保留,解析结果以 `[browser] client URL …` 记入日志(token 已脱敏)。

## 0.13.17
- Bottom session totals now match the web StatsPills: two pills under the composer — `{turns} turns {steps} steps · {tps} tok/s` and `{total} tok · {hit}% cache hit` — each opening a stat dialog on click (session statistics: LLM time, tool time, average TTFT, output TPS; token usage: exact total, cache hit, uncached input, cache read/write, output); a partial cache hit is never rounded up to 100% (precision grows until the shown value stays honest), and the old single plain-text stats line is gone
- 底部会话总量与网页端 StatsPills 对齐:输入框下方改为两枚胶囊 —— `{轮} 轮 {步} 步 · {tps} tok/s` 与 `{总量} tok · 缓存命中 {p}%`,点击分别展开「会话统计」(模型用时 / 工具调用用时 / 首 token 平均 TTFT / 输出速度 TPS)与「Token 用量」(精确总量 / 缓存命中 / 未缓存输入 / 缓存读取/写入 / 输出);部分命中不再被四舍五入成 100%(自动提高精度),原来那行纯文本统计已移除

## 0.13.16
- Header toolbar buttons now follow the VS Code theme instead of the primary-button blue: transparent background, `icon.foreground` icon color, `toolbar.hoverBackground` / `toolbar.activeBackground` on hover and press, 5px radius and a focus ring — no more solid blue chips clashing with the editor UI (light, dark and high-contrast themes all follow automatically); dialog confirm buttons and the send button keep their accent fill
- 头部工具按钮改为跟随 VS Code 主题,不再沿用主按钮蓝:透明底 + icon.foreground 图标色 + 悬停/按下用 toolbar.hoverBackground / toolbar.activeBackground + 5px 圆角 + 焦点圈,整排实心蓝按钮不再与编辑器界面冲突(浅色 / 深色 / 高对比主题自动跟随);对话框确认按钮与发送按钮仍保留强调色

## 0.13.15
- Compact context now matches the web client: the menu entries (slash menu and the left "/" menu) execute /compact immediately instead of inserting text, and the conversation shows a live compaction row (sweep while running → "Compacted N history items (~T tokens)", summary expandable); the compaction checkpoint is no longer rendered as a system-prompt card, the shadowed range is collapsed out of the transcript (live and on reload), and automatic compaction gets its own row; commands/execute allows 10 minutes because compaction runs synchronously on the host
- 压缩上下文与网页端对齐:菜单(斜杠补全与左下角 / 菜单)点击即执行 /compact,不再插入文本等待回车;对话内新增压缩命令行(运行中扫光 → 已压缩 N 条历史记录(约 T tokens),摘要可展开),压缩检查点不再落成「系统提示词」卡片,被压缩的区间在对话中折叠(实时与重载一致),自动压缩同样单列一行;另因压缩在宿主端同步执行,commands/execute 超时放宽到 10 分钟

## 0.13.14
- Fix the thinking row title collapsing to a single character: the icon and title were direct flex children of the row, so a long summary squeezed them; the thinking row now wraps them in .step-name like tool rows and the title itself is flex:none
- 修复思考行标题被压成一个字「思」:思考行的图标与标题此前直接挂在行容器上,长摘要按 flex 规则把它压缩;现与工具行一致包进 .step-name,并给标题加 flex:none

## 0.13.13
- Timeline cleanup: per-row rails and ticks removed in favour of one thin rail per contiguous process group (prose breaks the group); tool rows are re-anchored after their step's thinking block using the authoritative content order; thinking/tool titles are no longer width-capped; rows tightened to 24px
- 时间线收敛:去掉每行的竖线与刻度(改为每个连续过程段一条细导轨,正文打断分组),工具行按 content 顺序插回所属思考块之后,思考/工具标题不再被限宽截断,行高收紧到 24px

## 0.13.12
- Process area now uses the web timeline (thinking rows with a one-line preview that expand while streaming and collapse afterwards; tool rows with localized titles, human summaries, status dot and running sweep); fixed earlier turns showing their action row and usage while a turn is still running (hover-reveal, only the settled latest turn always shows); literal dsh-session: text inside attachment content is escaped so the host no longer parses documentation examples as session references and fails the turn
- 过程区改为网页端时间线:思考行(一行摘要,流式展开/结束收起)+ 工具行(本地化标题 · 人类可读摘要 · 状态点 · 运行扫光);修复会话运行中历史回合仍显示操作栏与用量(现为悬停淡入,仅已结束的最新回合常显);附件正文中的 dsh-session: 字面量自动转义,避免主机把文档示例当引用解析导致整回合失败

## 0.13.11
- The latest reasoning block now stays expanded while it streams (first delta renders immediately, later deltas update in place) and collapses once thinking ends; blocks the user toggled manually keep their state across re-renders; also fixed streamed text being deferred to the end of a block because empty blocks were skipped
- 最新思考过程流式期间默认展开(首个增量即时出现并按增量刷新),思考结束(文本块开始或回合结束)自动收起;用户手动开合过的思考块在后续重绘中保持;修复空块被跳过导致流式文本延迟到块结束才显示的问题

## 0.13.10
- Fix duplicated status emoji in attachment/image tips (the toast owns the icon; a leading emoji is stripped but keeps its meaning); four concatenated tips became placeholder dictionary keys translated into all 12 languages
- 修复附件/图片提示重复 emoji(toast 统一出图标,文案开头 emoji 自动剥离并保留语义);四条拼接提示改为带占位符的词典键并补齐 12 语言

## 0.13.9
- Web-parity turn footer (usage pill + duration pill + local clock) and deliverable file cards (Open / Open with default app / Reveal in File Explorer); permission, model, preset pills and the / button are now smaller
- 回合尾新增网页同款统计(用量胶囊 + 用时胶囊 + 本地时间)与交付文件卡(打开 / 用默认应用打开 / 在资源管理器中显示);权限、模型、预设胶囊与 / 按钮整体缩小

## 0.13.8
- To-do panel restyled as the web TodoPanel (title + non-zero-only progress summary + collapsible list + the three status glyphs); context meter ring moved to the top-right of the input box, right of the preset pill
- 任务清单改为网页端 TodoPanel 风格(标题 + 只列非零状态的进度摘要 + 折叠清单 + 三种状态图标);上下文进度环移到输入框右上角(预设胶囊右侧)

## 0.13.7
- Adapt to DSH 0.1.5-rc.1: commands/execute attachment parameter renamed to submittedAttachments, required subagents/prompt delivery, per-command attachment gating, token deltas via assistant-stream frames, image tool results; new web-style context meter ring with system/tools/messages breakdown
- 适配 DSH 0.1.5-rc.1:commands/execute 附件参数改名 submittedAttachments、subagents/prompt 必填 delivery、按命令声明裁决附件、逐 token 增量改走 assistant-stream 瞬态帧、工具结果图片渲染;新增网页同款上下文进度环与分类面板(系统提示词/工具定义/对话消息)

## 0.13.6
- Preset descriptions are now localized by id unconditionally for the built-in presets (standard / code / minimal / creator): presetDisplayText no longer depends on the trust field — some deployments or entry points may not supply it, or ship Chinese built-in metadata, which made the popup fall back to raw metadata and show Chinese on non-Chinese UIs. Behavior: built-in ids always resolve through the per-language dictionary (13 languages) with the EN fallback; only user presets keep their file metadata. Verified: all preset name/description keys exist in every language dictionary.
- 内置预设的名称与描述改为**按 id 无条件本地化**(标准/编码/极简/创造):presetDisplayText 不再依赖 trust 字段 —— 部分部署/入口可能不返回 trust,或内置元数据本身是中文,此前会导致非中文界面回退到原始元数据而显示中文。现在:内置 id 一律走当前语言词典(13 种语言)+ 英文回退;仅用户预设保留文件元数据。已校验:全部预设名/描述键在每份语言词典中都存在。

## 0.13.5
- Preset picker icons removed: the collapsed pill is now just '预设 · 名称 ▾' (no 🧩 emoji) and the popup option rows no longer carry the system/user emoji badges — name + muted description + ✓ only, keeping the row layout clean and aligned with the web's list.
- 预设选择器移除图标:收起胶囊只显示「预设 · 名称 ▾」(去掉 🧩),弹层选项行也去掉系统/用户 emoji 徽标 —— 仅保留 名称 + 灰色描述 + ✓,行布局更简洁、与网页端列表一致。

## 0.13.4
- Preset picker restyled like the permission popup: ① collapsed state is now a '🧩 预设 · 名称 ▾' pill (26px, same look as permission/model pills) instead of the native select; ② clicking opens a themed popup with a title ('选择 Agent 预设(新会话生效)') and option rows: system/user badge icon + bold name (+ · 默认) + muted description (system presets use the localized built-in descriptions; user presets use file metadata; broken presets show the reason in the danger color) + ✓ on the current one; ③ started sessions keep showing the plain preset text tag (no dropdown); selection flows through the same selectPreset message.
- 预设选择器按权限弹层样式重做:① 收起态改为「🧩 预设 · 名称 ▾」胶囊(与权限/模型胶囊同高同风格),不再用原生下拉;② 点开弹出主题化面板:标题「选择 Agent 预设(新会话生效)」+ 选项行 —— 系统/用户徽标图标 + 加粗名称(含 · 默认)+ 灰色小字描述(内置预设用本地化说明,用户预设取文件元数据,损坏预设显示原因并标危险色)+ 当前项 ✓;③ 已开始会话仍显示纯文本预设标签(不可点击);选择沿用同一 selectPreset 通道。

## 0.13.3
- Renderer decoupled from stream/row bookkeeping: assistant/message content parts (text & reasoning) are now ALWAYS rendered — the streamedBlockKeys gate is gone, and the only dedupe is content-equality against the last appended block (rows, live stream and message parts can all arrive independently; any source with real text renders). This removes the last conceivable path where present content could be suppressed by key collisions or stale replay state.
- 渲染与流式/行状态彻底解耦:assistant/message 的 content 部件(文本与推理)现在**无条件渲染** —— 移除 streamedBlockKeys 门槛,唯一去重是与上一块内容相等(行、实时流、消息部件三种来源可独立到达,任何带真实文本的来源都会渲染)。这排除了「内容存在却因键冲突或重放状态被吞掉」的最后一条可能路径。

## 0.13.2
- Turn-end fallback for assembly: chunkrow rows that were not yet flushed by an assistant/message (interrupted turns, row-before-node ordering) are now merged into the turn's assistant node when turn/end arrives — the last remaining ordering hole in the row-assembly path. Combined with the earlier verified pipeline (rows carry full text; replay reconstructs text + reasoning for every assistant node), the renderer now covers every arrival order.
- 回合结束时兜底组装:尚未被 assistant/message 落地的 chunkrow 行(中断回合、行先于节点到达等顺序组合)会在 turn/end 时按 index 合入该回合节点 —— 行组装路径上最后一个顺序漏洞补齐。配合已验证的管线(行内含完整文本;重放能为每个 assistant 节点重建文本与思考),渲染器现在覆盖所有到达顺序。

## 0.13.1
- Replay robustness: ① empty reasoning/text blocks are no longer rendered as placeholders (an interrupted stream or a row with no content used to leave a '思考过程' summary that expands to nothing) — blocks with no text are skipped so the conversation only shows actual content; ② the chunkrow row consumption from 0.13.0 is verified end-to-end against the live session journal: packing the real event log with rc.1's packChunkRuns and replaying it through the extension's row-assembly logic reconstructs text AND reasoning blocks for every assistant node.
- 重放增强:① 空的推理/文本块不再渲染为占位(中断的流式块或无内容行之前会留下点开为空的「思考过程」)—— 无文本的块直接跳过,对话里只显示真实内容;② 0.13.0 新增的 chunkrow 行消费已用真实会话日志端到端验证:用 rc.1 的 packChunkRuns 打包本次会话事件、再走扩展的行组装逻辑,每个 assistant 节点都能重建出文本与思考块。

## 0.13.0
- Fix first-open blank states and missing final text on replay: ① the permission & model pickers rendered their lists only while the popup was already open, so the first click opened an empty panel (a second click was needed) — the lists are now rebuilt on every render, so the first open is populated immediately and late-arriving projections (permissions etc.) fill an open popup live; ② the composer top-right preset now shows a plain text label once a session has started (preset is fixed mid-conversation) instead of hiding or showing a misleading dropdown; ③ clicking a conversation could stay blank until a second switch: the follow snapshot usually arrives after the select push, and nothing re-pushed the history — hub now notifies onFollowReady and the panel re-pushes the full state once the snapshot is merged; ④ replayed history only showed reasoning without final text: rc.1 persists streamed output as compacted chunkrow rows (text-chunks / reasoning-chunks / tool-call-chunks) and old history pages contain no per-token assistant/chunk events — the renderer now consumes those rows and assembles text/reasoning/tool blocks the same way the web client does.
- 修复首次打开空白与重放缺最终文本:① 权限/模型选择器只在弹层已打开时才重建列表,首次点击展开的是空面板(要点两次才见选项)—— 现在每次渲染都重建列表,首次展开即有内容,晚到的投影(如权限选项)也会实时填充已打开的弹层;② 输入框右上角预设:会话已开始(预设固定不可切)时改为显示纯文本标签,不再显示误导性的可切换下拉;③ 点击会话首次可能一直空白、需再切一次才显示:follow 快照常在切换推送之后才到,而快照合并后没有触发重推 —— hub 新增 onFollowReady 通知,快照入库后面板自动重推全量;④ 重放历史只有思考没有结果文本:rc.1 把流式输出持久化为压缩行(text-chunks / reasoning-chunks / tool-call-chunks),旧历史页不再有逐 token 的 assistant/chunk 事件 —— 渲染器现在按网页端同款逻辑消费这些行并组装文本/推理/工具块。

## 0.12.99
- Fix permission switching, ghost /permission messages and commit-message timeouts: ① commands/execute always carries the gateway-required images field now — rc.1's descriptor is strict (missing images = gateway/arguments-invalid), and the old code only sent it when some command declared input.images (Minimal/preset sessions hid goal/plan, so /permission and other commands were rejected and fell back to being queued as plain chat text — that is why the web (generated client always sends images) could switch permissions mid-conversation while the extension could not); ② a gateway refusal (agent busy / invalid args) no longer falls back to the prompt-as-command text path — only transport-level absence does; refusals surface as clear notices (a running turn now explains the preset applies on the next turn); ③ commit-message generation no longer times out: the one-shot archived session gets its own session/follow watcher (0.1.2 session events are per-address, so without following the session no turn-end event ever reached the store and generation always hit the 120s timeout). Live-verified on a real rc.1 server: /permission read-only|workspace-write|danger-full-access all execute successfully with images: []; EN/zh-cn/zh-tw l10n for the busy notice.
- 修复权限切换、幽灵 /permission 消息与提交信息超时:① commands/execute 现在始终携带网关必填的 images 字段 —— rc.1 描述符为严格校验(缺失即 gateway/arguments-invalid),而旧代码只在某个命令声明 input.images 时才带上(极简等预设隐藏了 /goal /plan,导致 /permission 等命令被网关拒绝后回退成普通文本排进对话 —— 这正是网页端(生成式客户端总是带 images)能直接切换权限而扩展不能的原因);② 网关明确拒绝(会话忙/参数无效)不再回退到「命令当文本发」的旧路径,只有传输层不可用才回退;拒绝会给出明确提示(回合运行中会说明权限将在下一回合生效);③ 提交信息生成不再超时:一次性归档会话现在单独开 session/follow 监听(0.1.2 会话事件按地址分路,不跟随该会话就永远收不到回合结束事件,生成必然撞 120 秒超时)。已在真实 rc.1 服务器实测:/permission read-only|workspace-write|danger-full-access 带 images:[] 全部执行成功;忙碌提示补 EN/zh-cn/zh-tw 词条。

## 0.12.98
- Permission control restyled after the reference screenshot + composer row alignment: ① the collapsed permission control is now an icon+name pill ('⚠ 完全访问 ▾', yellow warning for the dangerous preset) instead of the old '权限' label + native select, with the same 26px height as the model pill; ② clicking opens a popup like the image: header '应如何批准操作?' with a '了解更多' link (opens the settings panel), then options as icon + bold name + muted description rows (server-provided description preferred, local bilingual fallback for read-only / workspace-write / danger-full-access / custom) with a ✓ on the current one and yellow highlight for the dangerous option; ③ the left '/' (slash) button is smaller (26px) and both it, the permission pill and the model pill now share the same height — bottom row stays visually even; ④ selection is still optimistic + /permission projection re-sync, and the / menu permission section works as before.
- 权限控件按参考截图重做 + 底部行对齐:① 权限收起态从原来的「权限」标签+原生 select 改为「⚠ 图标 + 名称 ▾」胶囊(完全访问用黄色警告文字),与模型胶囊同高 26px;② 点击弹出与截图同款弹层:标题「应如何批准操作?」+ 右侧「了解更多」(打开设置面板),下面每个选项为 图标 + 加粗名称 + 灰色说明(优先用服务器提供的 description,本地提供只读/工作区可写/完全访问/自定义的双语兜底说明),当前项打 ✓,危险项黄色高亮;③ 左侧 / 命令按钮缩小到 26px,与权限胶囊、模型胶囊保持同高,底部行视觉整齐;④ 选择仍是乐观更新 + /permission 投影校准,/菜单里的权限切换分组保持一致。

## 0.12.97
- Model & thinking control moved to the composer bottom-right, restyled after the permission dropdown look: ① the ⚡ spark icon is gone — the collapsed control is now a slim pill 'model · effort ▾' matching the tool-item/select style (999px radius, subtle border, hover accent, chevron rotates when open); ② the model name ellipsizes (max-width truncation) while the reasoning effort stays always visible as its own non-shrinking span — e.g. 'deepseek-v4-Fl... · Max'; ③ the popup now opens upward from the bottom-right button, keeping the two sections (model list + reasoning segmented options) with fixed width; ④ label shows '模型' without effort separator when no model is selected.
- 模型与思考控件移到输入框右下角,并按权限下拉的样式风格优化:① 去掉模型前的闪电小图标 —— 收起态是与「权限」同款风格的细长胶囊「模型名 · 思考名 ▾」(999px 圆角、细边框、hover 高亮、展开时箭头旋转);② 模型名超长省略号截断,推理强度单独一个不收缩的 span,始终完整显示 —— 例如 deepseek-v4-Fl... · Max;③ 弹层改为从右下角按钮向上弹出,仍分两节(模型列表 + 推理等级分段),宽度固定;④ 未选择会话时按钮显示「模型」且不显示分隔符与强度。

## 0.12.96
- Model & thinking control refined (compact + dropdown sections): ① collapsed state is now a single slim pill — ⚡ model · effort ▾ — that never stretches the composer (label ellipsis, max-width on both the pill and the popup, list rows ellipsize); ② clicking it opens one popup whose two sections let you pick the model (✓ current) and the reasoning level (default + each effort as segmented options) independently — the popup stays open after either pick so you can tune both, and closes on outside click / Esc; ③ clear guidance when the selected model cannot take images: sending with images on a non-vision model (session/attachment-invalid / MODEL_DOES_NOT_SUPPORT_IMAGES) now reports 'model X does not support image input — remove the images or switch model via the top-right button' instead of the raw error dump (image type/size/base64 failures get their own actionable texts too; EN/zh-cn/zh-tw l10n).
- 模型与思考控件精修(紧凑收起 + 弹层分节):① 收起态改为单个细长按钮 ⚡ 模型 · 思考 ▾,不会把输入区撑宽 —— 按钮文案省略号截断,按钮与弹层都有宽度上限,列表行超长省略;② 点击弹出单一面板,面板内分两节可分别选择模型(当前项打 ✓)与推理等级(默认 + 每个强度一段式选项),选完任一项面板保持打开方便连续调整,点外部或 Esc 关闭;③ 所选模型不支持图片时给出明确引导:带图发送到非视觉模型(session/attachment-invalid / MODEL_DOES_NOT_SUPPORT_IMAGES)时,提示「当前模型不支持图片输入:请移除图片附件,或点击右上角模型按钮切换支持图片的模型」,不再只显示原始错误(图片类型/数量/体积/base64 失败也有各自的可用提示;已补 EN/zh-cn/zh-tw 词条)。

## 0.12.95
- Merge model & thinking into one picker (reference screenshot style): ① the separate thinking select (top-right) and model select (bottom-right) are gone; one rounded card sits at the composer top-right — ⚡ model name · effort label + chevron, plus an inline thinking segment (default + one dot per effort, click to switch, active dot highlighted in accent) — ② clicking the card header opens a themed model list popup (group/model names, ✓ on the current model, current-but-not-in-catalog placeholder preserved); the pill label and dot state update optimistically and re-sync from server projections; ③ 默认 effort is kept as the first dot (unspecified → model default); styling follows VS Code theme tokens (card/knob/track/menu colors, hover chevron translate, no new dependencies).
- 模型与思考整合为一个选择器(参考截图样式):① 原来的「思考」下拉(右上角)与「模型」下拉(右下角)合并 —— 输入框右上角是一个圆角卡片:⚡ 模型名 · 思考名 + 右箭头,卡片内还带一段思考分段圆点(默认 + 每个推理强度一个圆点,点击即切换,激活点用主题蓝色高亮);② 点击卡片头部弹出模型列表(分组/模型名、当前模型打 ✓,当前模型不在目录时保留占位项);胶囊文案与圆点状态乐观更新,服务端 projection 到达后再次校准;③ 「默认」保留为第一个圆点(不指定思考强度);样式全部走 VS Code 主题令牌(卡片/圆点/轨道/弹层配色、hover 箭头动效),无新增依赖。

## 0.12.94
- Fix image sends + paste support: ① 'session/attachment-invalid: Declared image type does not match its bytes' — the 0.1.2-rc.1 server validates image bytes against the declared mediaType (IMAGE_TYPE_MISMATCH), but the extension derived mediaType from the file extension (a .png that is really JPEG, .bmp mapped to png…); images are now sniffed from magic bytes (PNG/JPEG/GIF/WebP) before sending, unsupported/corrupt files are skipped with a clear notice, and the .bmp dial filter entry was removed; ② composer paste support: clipboard images (screenshots, copied bytes) become image attachments in the same chips row next to + (byte-sniffed, ≤6MB each, ≤8 per message), and local files/folders copied from Explorer (file:// URIs, drive or UNC paths) attach exactly like the + file picker; plain-text pastes keep the default behavior.
- 修复图片发送 + 新增粘贴支持:① 「session/attachment-invalid: Declared image type does not match its bytes」—— 0.1.2-rc.1 服务端按字节校验图片与声明的 mediaType 是否一致(IMAGE_TYPE_MISMATCH),而扩展此前按文件扩展名声明(如 .png 实为 JPEG、.bmp 被映射成 png);现在发送前按魔数探测真实类型(PNG/JPEG/GIF/WebP),无法识别/损坏的文件跳过并给出明确提示,选择框里的 .bmp 过滤项已移除;② 输入框支持粘贴:剪贴板图片(截图、复制图片)自动成为图片附件,出现在 + 号右侧同一芯片行(字节探测、单张 ≤6MB、每条消息 ≤8 张);从资源管理器复制的本地文件/文件夹(file:// URI 或盘符/UNC 路径)粘贴后与 + 菜单选择文件一样附加;纯文本粘贴行为不变。

## 0.12.93
- Composer attachment layout fix: ① image attachments now render in the same attachment row as file/folder attachments (right of the + button) — they used to live in a separate row at the very top of the composer, so an added image appeared above the input while file chips sat next to +; ② both kinds share one chips row (image chips keep the dashed border for distinction) and the standalone .images-row was removed.
- 输入区附件布局修复:① 图片附件现在与文件/文件夹附件同排显示(+ 号图标右侧)—— 此前图片芯片独立渲染在输入区顶部的一行,添加图片后出现在输入框上方,而文件芯片在 + 号右侧;② 两类附件共用同一芯片行(图片芯片保留虚线边框用于区分),并移除了独立的 images-row 行。

## 0.12.92
- Adapt to DeepSeek Harness v0.1.2-rc.1 (latest published release, 2026-09-03): ① the release's wire contract equals the 0.1.2-alpha.4 one — now audited directly against the published rc.1 runtime (source diff alpha.4 → rc.1: storage/projection internals only) AND a live rc.1 server, which is what actually surfaced the fixes below; ② fixed the gateway parameter wrapper: every single-parameter Remote expects the parameter-name envelope `{request: …}` (`session/list` uses `_request`) but the extension sent raw fields — session/list, session/search, session/page, session/prompt, session/create, session/cancel, session/rename, session/fork, session/attachment, session/selectModel, session/updateQueue, skills/list, subagents/prompt, workspace/create|rename|delete|insertBefore|insertSessionBefore|archiveSession and the session/follow streams now send the wrapper (a real rc.1 server rejected session/list with gateway/arguments-invalid, so the whole 0.1.2 server path was unusable); ③ `credentials/describe` actually returns a plain `ref → info` record, not `{credentials: …}`; ④ live-verified against a fresh rc.1 server: auth cookie exchange (303 + dsh-auth cookie), session/list − create − page − rename − prompt − cancel, modelCatalog, skills/list, subagents/list, commands/list, fileReferences/list, sessionReferenceResolver/candidates, agentPresets/list, settings/describe, credentials/describe, llm/listProviders, dynamicCordisRunner/inventory, goals/create, workspace/create plus the workspace/follow, session/control, session/follow streams and the $events ready frame; ⑤ verified not to touch the wire: Remote gateway unified dispatch, one-time-token launch URLs for network access, WebSocket heartbeats (ws auto-Pong keeps the mux alive), storage v5 + compatibleVersions/backupRecord, Node 24.0–24.11.1 startup fix, caller-optional subagent model selection — note: rc.1 disables session/search by default (openAt "never") and the extension surfaces the server message; ⑥ npx/npm/direct-install/update channels now install @deepseek-ai/dsh@latest — 0.1.2-rc.1 is on `latest`/`next`, while `alpha` (0.1.2-alpha.5) is no longer the release the extension should deploy.
- 适配 DeepSeek Harness v0.1.2-rc.1(最新发布版本,2026-09-03):① 该版本线协议与 0.1.2-alpha.4 相同 —— 现在直接对照已发布 rc.1 运行时(alpha.4 → rc.1 源码差异仅存储/投影内部)并对真实 rc.1 服务器逐项实测,正是实测暴露了以下修复;② 修复网关参数包装:单参数 Remote 必须使用参数名信封 `{request: …}`(`session/list` 为 `_request`),而扩展此前直接发送裸字段 —— session/list、session/search、session/page、session/prompt、session/create、session/cancel、session/rename、session/fork、session/attachment、session/selectModel、session/updateQueue、skills/list、subagents/prompt、workspace/create|rename|delete|insertBefore|insertSessionBefore|archiveSession 以及 session/follow 流现已带包装(真实 rc.1 服务器此前以 gateway/arguments-invalid 拒绝 session/list,0.1.2 服务器路径整体不可用);③ `credentials/describe` 实际返回 `ref → info` 记录,并非 `{credentials: …}`;④ 已对新起的 rc.1 服务器实测:认证 cookie 交换(303 + dsh-auth cookie)、session/list − create − page − rename − prompt − cancel、modelCatalog、skills/list、subagents/list、commands/list、fileReferences/list、sessionReferenceResolver/candidates、agentPresets/list、settings/describe、credentials/describe、llm/listProviders、dynamicCordisRunner/inventory、goals/create、workspace/create 及 workspace/follow、session/control、session/follow 各流与 $events ready 帧;⑤ 核实不影响线协议的 rc.1 变更:Remote 网关统一远程调用与异常分发、网络访问一次性 token 启动链接、WebSocket 心跳(ws 自动 Pong 保活)、存储 v5 + compatibleVersions/backupRecord、Node 24.0–24.11.1 启动修复、子代理模型选择(调用方可选)—— 注意:rc.1 默认禁用 session/search(openAt "never"),扩展会显示服务器提示;⑥ npx/npm/直接安装/升级通道改为 @deepseek-ai/dsh@latest —— 0.1.2-rc.1 已发布为 `latest`/`next`,`alpha`(0.1.2-alpha.5)不再是扩展应部署的版本。


## 0.12.91
- Fix "授权数据缺失(服务器由外部启动)" on upgrades: ① the 0.1.2 browser-auth is now lazy — the client sends requests first and only exchanges the launch-token cookie when the server actually answers 401/403, so an old 0.1.1-rc.2 server (no auth) is no longer blocked before the request is sent; ② when the server was started by a previous extension instance or a terminal, the client re-reads the extension log files (%TEMP%\dsh-vscode-server.log / -install.log) for the auth URL and retries once; ③ a running legacy server (0.1.1-rc.2 and earlier, dotted endpoints) is detected via host.describe and reported with a clear "stop and restart" message instead of a vague offline state; ④ the offline watcher now calls ensureReady on every tick, so once you stop the old server the extension auto-starts the new one (honoring dsh.autoStart) and captures the token itself.
- 修复升级后「授权数据缺失(服务器由外部启动)」:① 0.1.2 浏览器认证改为懒认证 —— 客户端先发请求,只有服务器真正返回 401/403 时才用启动 token 交换 cookie,旧版 0.1.1-rc.2 服务器(无需认证)不再被请求前误拦;② 服务器由上一个扩展实例或终端启动时,客户端会从扩展日志(%TEMP%\dsh-vscode-server.log / -install.log)重新读取授权 URL 并重试一次;③ 运行中的旧版服务器(0.1.1-rc.2 及更早,点号端点)通过 host.describe 识别,给出明确的「停止并重启」提示,而不是笼统的离线;④ 离线巡检改调 ensureReady:停掉旧服务器后,扩展会自动拉起新服务器(遵循 dsh.autoStart)并自行获取授权。

- Adapt to DeepSeek Harness v0.1.2-alpha.4 (breaking wire-contract port): ① the web API moved to slash-style Typert Remote endpoints with an `{args}` envelope — session.list → session/list, session.history → session/page (address + throughSeq), session.models → session/modelCatalog, host.describe removed, goal.* → goals/*, agentPreset.* → agentPresets/*, skill.list → skills/list, subagent.* → subagents/*, settings/credentials/llm renamed, workspace.list removed (list now comes from the workspace/follow stream); ② events.mux / events.host / /api/respond are gone: session events, queue/jobs/projections, workspaces, approvals/questions and Cordis events now flow over one /api/remote.mux WebSocket (session/follow, session/control, workspace/follow, $events) and approvals/questions are answered with $events/result waterfall outcomes (approval/request, user-questions/request); ③ new browser authentication — every /api request needs the signed cookie exchanged from the launch token printed by `dsh web`; the extension parses the token out of the server log, swaps it for a cookie and refreshes on 401; ④ session.prompt now requires a client-minted requestId and session/rename/fork/updateQueue responses were audited; ⑤ the bundled dsh-git-rollback@0.1.10 is rebuilt from source: it adapts to the new CommandRuntime signature (commands.execute now takes the images argument) and fixes a latent ReferenceError in the savepoint path (saveCommit was never declared), and the index.lock hardening (GIT_INDEX_FILE temp indexes, GIT_OPTIONAL_LOCKS=0, retryLock) now lives in the plugin source — all 13 plugin tests pass.; ⑥ npx/npm/direct-install/update channels now install @deepseek-ai/dsh@alpha — the newest published release (0.1.2-alpha.4) lives on the `alpha` dist-tag while `latest` still points at 0.1.1-rc.2.
- 适配 DeepSeek Harness v0.1.2-alpha.4(线协议破坏性变更,全量移植):① 网页 API 改为斜杠风格 Typert Remote 端点 + {args} 信封 —— session.list → session/list、session.history → session/page(address + throughSeq)、session.models → session/modelCatalog、host.describe 移除、goal.* → goals/*、agentPreset.* → agentPresets/*、skill.list → skills/list、subagent.* → subagents/*、settings/credentials/llm 端点改名、workspace.list 移除(列表改由 workspace/follow 流提供);② events.mux / events.host / /api/respond 全部移除:会话事件、队列/任务/投影、工作区、审批/提问与 Cordis 事件改为走单一 /api/remote.mux WebSocket(session/follow、session/control、workspace/follow、$events),审批与提问以 $events/result 的 waterfall outcome 应答(approval/request、user-questions/request);③ 新增浏览器认证 —— 所有 /api 请求需要由 `dsh web` 打印的启动 token 交换签名 cookie;扩展从服务器日志解析 token、换取 cookie 并在 401 时自动刷新;④ session.prompt 现在必需客户端预生成的 requestId,并逐项核对 session/rename/fork/updateQueue 响应;⑤ 内置 dsh-git-rollback@0.1.10 由源码重新构建:适配新 CommandRuntime 签名(commands.execute 新增 images 参数),并修复保存点路径中 saveCommit 未声明的潜在 ReferenceError;index.lock 加固(GIT_INDEX_FILE 临时索引、GIT_OPTIONAL_LOCKS=0、retryLock)现已内置到插件源码,13 项测试全部通过。;⑥ npx/npm/直接安装/升级通道改为 @deepseek-ai/dsh@alpha —— 最新公开版本(0.1.2-alpha.4)在 alpha dist-tag 上,`latest` 仍指向 0.1.1-rc.2。

- i18n & description: ① the settings-panel "DSH 用户技能" toggle label now uses the UI translation table (was hardcoded Chinese), so it follows the VS Code display language like every other setting; ② README (the extension description page) now embeds two git-rollback screenshots at the feature descriptions — the "Undo turn's changes" review dialog and the message-action menu (Undo this turn's file changes / View checkpoints / Branch from here) — and the turn-level Git rollback feature bullet was expanded to cover the per-turn undo and checkpoint review; ③ the short plugin description (package.json + all 14 localized package.nls) was refreshed to mention @ file/session/agent mentions, multimodal images, subagents, Cordis plugin approvals, and turn-level Git rollback.
- 多语言化与描述:① 设置面板的「DSH 用户技能」开关标签改为走界面翻译词典(原先硬编码中文),现在与其他设置一样跟随 VS Code 显示语言;② README(即插件描述页)在对应功能描述处嵌入两张 git 回退截图 —— 「撤销本回合改动」审核弹窗 与 消息操作菜单(撤销本回合改动 / 查看检查点 / 从此处新建分支),并扩充回合级 Git 回退条目,涵盖单回合撤销与检查点查看;③ 插件短描述(package.json + 14 份本地化 package.nls)更新,提及 @ 文件/会话/智能体提及、多模态图片、子代理、Cordis 插件审批与回合级 Git 回退。

## 0.12.88
- Fix "index.lock: File exists" conflicts that made commits/sync fail after generating a commit message: the rollback plugin's automatic checkpoint snapshot (taken at every turn start/end — including the turn created when generating a commit message) used to run "git add -A" + "git write-tree" + "git read-tree" against the real .git/index, repeatedly acquiring .git/index.lock and colliding with your own "git add"/"git commit"/sync. Now the checkpoint and savepoint snapshots stage into an isolated temporary index (GIT_INDEX_FILE) and leave your real index untouched — verified: the snapshot keeps your staged state, never touches .git/index, and leaves no index.lock. All read-only git commands (status/diff/ls-files/rev-parse) in both the extension and the plugin now run with GIT_OPTIONAL_LOCKS=0 so they no longer refresh or lock the index; the actual rollback/undo index writes (read-tree/reset, user-triggered) retry briefly on an index.lock contention.
- 修复用插件生成提交消息后 git add/同步报 index.lock 冲突的问题:回退插件的自动检查点快照(每回合开始/结束执行,包含生成提交消息时创建的那一回合)原先对真实 .git/index 执行 "git add -A" + "git write-tree" + "git read-tree",反复获取 .git/index.lock,与你自己的 git add/commit/同步互踩。现在检查点与保存点快照改用独立临时索引(GIT_INDEX_FILE),完全不触碰你的真实索引 —— 已实测:快照保留你的暂存状态、不改 .git/index、无 index.lock 残留。扩展与插件中的所有只读 git 命令(status/diff/ls-files/rev-parse)现以 GIT_OPTIONAL_LOCKS=0 运行,不再刷新或锁定索引;真正的回退/撤销索引写入(read-tree/reset,用户触发)在遇到 index.lock 争用时短暂重试。

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
