# Changelog


## 0.13.48
- **Header refreshed.** The session row now uses one consistent 8px rhythm, a 6/10px dropdown trigger on the theme's input background with the widget border, and a real bottom divider (only when the theme defines one). The `+` icon button became **「新建对话」** — plus icon plus label — so the primary action of that row is readable instead of a bare glyph.
- **Every emoji left the session list and its ⋯ menu.** Rows carried ⏳ / 🛡️ / 📋 / ❓ / 🆕 / 💬 depending on state; they now use small theme-coloured dots with a text label (green pulsing dot + 运行中, blue dot + 等待回答, purple + 计划待审, amber + 等待审批, grey for an idle subagent), so light and dark themes agree and nothing depends on how a font renders an emoji. Untitled sessions fall back to "新会话 · <id>" instead of an emoji prefix.
- The ⋯ menu items are line icons + text (rename / fork / copy ID / archive) on the new menu surface: 2px gaps, widget border, a softer shadow, muted icons that follow the foreground on hover, and labels that re-render on a language switch.
- Same cascade trap as before, caught in review: the new-session button needed a `.btn` prefix, because the generic `.btn` rule sits later in the stylesheet and was overriding its background.
- Verified by rendering the real bundle + real CSS in headless Chromium at a realistic sidebar width in both palettes (session dropdown, ⋯ menu, new-chat button), plus typecheck, duplicate-key check and all six UI suites.
- **顶部改版**。会话这一行统一成 8px 间距;会话下拉触发按钮改成输入框底色 + 控件描边、6/10px 内边距;底部加了一条分隔线(主题定义了 panel-border 时才显示)。原来的 `+` 纯图标按钮改成 **「新建对话」**(＋ 图标 + 文字),这一行最主要的动作不再是一个只能靠猜的字形。
- **会话列表与 ⋯ 菜单里的 emoji 全部移除**。之前列表行按状态带 ⏳ / 🛡️ / 📋 / ❓ / 🆕 / 💬;现在统一成主题色小圆点 + 文字(绿色脉冲点 + 运行中、蓝点 + 等待回答、紫点 + 计划待审、琥珀点 + 等待审批、灰点表示空闲子代理),亮色/暗色一致,也不再取决于字体怎么渲染 emoji。无标题会话的兜底名改成「新会话 · <id>」,不再带 emoji 前缀。
- ⋯ 菜单条目改成线性图标 + 文字(重命名 / 分叉 / 复制 ID / 归档),菜单本身也换了表面:2px 条目间距、控件描边、更柔和的投影,图标用次要色、悬停跟随前景色,语言切换时文字会就地刷新。
- 又一次撞到同一个层叠陷阱并在自查时抓住:新建对话按钮必须带 `.btn` 前缀 —— 通用 `.btn` 规则在文件更靠后,会把它的底色覆盖掉。
- 验证:真实包 + 真实 CSS 在无头 Chromium 里按真实侧栏宽度、深色/浅色各渲染一次(会话下拉、⋯ 菜单、新建对话按钮),并跑 typecheck、重复键检查与六套界面夹具。


## 0.13.47
- Removed the small ❓ glyph that each question's text carried inside the 提问 card. The card header already shows that icon as its category marker, so the body started with a second identical icon on a shorter line — visually it looked like a bullet hanging off the question. The question text now starts at the card's own left margin, which also gives long questions a little more line width.
- Nothing else changed: options, custom input, pager, 跳过本题 / 提交回答, the countdown pill and the plan-review card are untouched; typecheck plus the plan-review and 0.2.1-feature suites still pass, and the result was checked in a rendered screenshot.
- 去掉提问卡片里每道题题面前那个小 ❓。卡片头部本就已经用同一个图标做类别标记,正文再出现一个同款小图标、还挂在题目行首,看起来像一颗多余的列表符号;现在题面直接从卡片左边距开始,长问题也宽松一点。
- 其他都没动:选项、自定义输入、翻页、跳过本题 / 提交回答、倒计时胶囊、计划审阅卡片均保持原样;typecheck 与计划审阅 / 0.2.1 功能两套夹具仍通过,并已用渲染截图核对。


## 0.13.46
- The 子代理目录 (subagent catalog) popover's refresh control is now the **word 刷新** instead of the 🔄 emoji. The emoji rendered as a blue rounded square on Windows and read as an unrelated icon; the text keeps the same job with no font-dependency, sits on the same line as the title as a small pill (input background + widget border, theme hover/focus), and keeps a descriptive tooltip ("重新读取子代理目录") rather than repeating its own label.
- The popover header got a little more breathing room (6px vertical padding) so the pill is no longer cramped against the top edge.
- Verified by rendering the real bundle + real CSS in headless Chromium in both palettes; the new tooltip string is localized in 14 languages (dynamic t() key, so check-i18n cannot see it — added to EN_TEXT and all 12 Webview dictionaries).
- 子代理目录弹层的刷新控件从 🔄 图标改成**文字「刷新」**。那个 emoji 在 Windows 上渲染成蓝色圆角方块,看起来像个无关的图标;换成文字后不依赖字体,和标题同一行、做成一枚小胶囊(输入框底色 + 控件描边,悬停/聚焦走主题色),悬停说明改成「重新读取子代理目录」而不再重复按钮自己的文案。
- 弹层头部留白也顺手调大了(上下 6px),胶囊不再贴着头顶。
- 验证:真实包 + 真实 CSS 在无头 Chromium 里按深色/浅色渲染确认;新增的提示文案补齐了 14 种语言(它是动态 t() 键,check-i18n 扫不到,所以手工写进 EN_TEXT 与 12 份 Webview 词典)。


## 0.13.45
- **DSH 0.2.1-rc.2 compatibility — the wire contract did not move at all.** Verified two ways: a mechanical diff of the published packages (rc.1 → rc.2) and a live isolated rc.2 server driven by this extension's own client. Result: 173 Typert endpoints, 23 forwarded `$events` entries, 21 session projections, 57 session event types and all three mux stream constants are identical; envelope, cookie auth and the `remoteAccess` baseline are unchanged. rc.2 adds exactly two packages and neither touches the wire: `dsh-web-deepseek-api` (DeepSeek Search/Fetch provider behind the existing `web_search`/`web_fetch` tools) and `dsh-client-ui-deepseek-model-label-1017` (a 1017 badge for the Web UI's model labels).
- Model catalog re-checked because the commit-message generator depends on it: `deepseek-flash` and `deepseek-v4-pro` are still there and Flash still reports `off/low/high/max` reasoning efforts, so nothing had to change there — the new V4.1 labelling is display-only.
- The one visible side effect was in Settings: rc.2 composes two new namespaces (`web`, `web-deepseek-api`). They now have proper titles instead of raw ids, `web-deepseek-api` is grouped with the model providers (it is a credentials/endpoint config), and both titles are localized in 14 languages — these are dynamic keys that `check-i18n` cannot see, so they were added to `EN_TEXT` plus all 12 Webview dictionaries by hand.
- Everything else in this release is verification only: the plan-review, history-key, 0.2.1-feature, stats, attachment, compaction and send-key suites all still pass, together with typecheck and the duplicate-key check.
- **兼容 DSH 0.2.1-rc.2 —— 线协议一个字节都没动**。两条路验证:把已发布包 rc.1 → rc.2 做机械 diff,再用本扩展自己的客户端驱动一台隔离的 rc.2 服务器实跑。结果:173 个 Typert 端点、23 条 `$events` 词表、21 个会话投影、57 种会话事件、三条 mux 流常量全部一致;信封、cookie 认证、`remoteAccess` 基线也不变。rc.2 只新增两个包,且都不进线协议:`dsh-web-deepseek-api`(DeepSeek Search/Fetch 提供方,挂在既有的 `web_search`/`web_fetch` 工具后面)与 `dsh-client-ui-deepseek-model-label-1017`(网页端模型标签上的 1017 徽标)。
- 因为「生成提交信息」依赖模型目录,专门复查了一遍:`deepseek-flash` 与 `deepseek-v4-pro` 都还在,Flash 的推理等级仍是 `off/low/high/max`,所以那部分无需改动 —— 新的 V4.1 标注只影响显示名。
- 唯一可见的变化在设置页:rc.2 组合进了两个新命名空间(`web`、`web-deepseek-api`)。现在它们有正经标题(不再是原始 id),`web-deepseek-api` 归到模型供应商一组(它本质是凭据 + 端点配置),两条标题都补齐了 14 种语言 —— 它们是 `check-i18n` 扫不到的动态键,所以手工补进了 `EN_TEXT` 与 12 份 Webview 词典。
- 其余都是回归验证:计划审阅 / 输入历史 / 0.2.1 功能 / 统计胶囊 / 附件 / 压缩行 / 发送键七套夹具 + typecheck + 重复键检查全部通过。


## 0.13.44
- **Slash-command records (/plan, /compact, …) no longer look like system notices.** They were rendered as a .msg-note, which is centred and dashed — so your own command appeared floating in the middle of the transcript, detached from the conversation side. Command records now get their own class and become a small right-aligned pill (input-background fill, widget border, monospace, `⌘` prefix), matching your own messages.
- The short dashed line above it was a collapsed **attachment-context card** (.attach-card) carrying the same dashed, centred look with a background that vanished in light themes. It is now a right-aligned pill with the input background and a widget border, so a collapsed "📎 附件上下文" reads as a compact row instead of a stray dashed rule.
- Also hardened: an empty note (or an empty queued message) no longer paints an empty bordered box — those used to leave a one-pixel dashed segment behind after edits/clears.
- Queued messages (⏳ 排队中) now sit on the same side as your messages with a solid, theme-coloured surface instead of a centred dashed box, keeping the badge as the only "waiting" signal.
- Verified by rendering the real bundle + real CSS in headless Chromium in both palettes, with a session that has a finished turn, an attachment-context card and a `/plan` command, plus screenshots.
- **斜杠命令记录(/plan、/compact 等)不再像系统提示**。它以前走 `.msg-note`(居中 + 虚线),于是你自己发的命令悬在对话中央、和用户消息分属两侧。现在命令记录有独立类名,渲染成右侧对齐的小胶囊(输入框底色 + 控件描边 + 等宽字体 + `⌘` 前缀),与你自己的消息同侧。
- 你看到的那条短虚线其实是**折叠态的附件上下文卡**(`.attach-card`):同样是虚线、同样偏中,且底色在亮色主题下几乎消失。现在改为右侧对齐的胶囊(输入框底色 + 控件描边),折叠时就是一行「📎 附件上下文」,不再是悬空的一截虚线。
- 顺带加固:**空 note / 空排队项不再画出带边框的空框** —— 以前编辑或清空后会残留一像素高的虚线段。
- 排队消息(⏳ 排队中)也移到与用户消息同侧,改成实线主题表面,只靠徽标表达"等待发送"。
- 验证:用真实包 + 真实 CSS 在无头 Chromium 里按深色/浅色两套配色渲染(含已完成回合、附件上下文卡与 `/plan` 命令),并附截图。


## 0.13.43
- **Plan review aligned with the 0.2.1 host and the Web `PlanPreview`.** The plan-mode chip is now driven by the host's `plan` projection instead of only the transient `plan/mode` event: the effective state is folded exactly like the Web `PlanChip` (`pending ? !active : active`), so a just-sent `/plan` shows "Plan mode (switching…)" and the chip survives a reload or a session switch. That last part was a real defect — the init path never re-rendered the chips, so the chip only appeared after the next event.
- The plan card gained the Web UI's two secondary entrances: **View full text** opens a full-page preview (rendered Markdown, 14px at 1.75 line-height, its own scroll area, Esc or backdrop to close, `打开计划文件` when the plan was persisted to `.dsh/plans/`), and the card itself keeps a compact scrollable body. Code blocks and tables inside both views now get their own boxes instead of collapsing into body text.
- **Close-review-to-comment** follows the 0.2.1 behaviour ("closing the plan review to add comments ends the turn and waits for feedback, without another model call"): a new `关闭审阅,去补充意见` action cancels the review, drops the card, focuses the composer and says the agent is waiting — instead of forcing you to type into the card's inline field. Approve (`确认执行`) and `拒绝` still submit the host's own option labels, and the inline `输入修改意见` field still answers within the card.
- Verified with a 15-case jsdom suite over the real bundle (projection→chip folding, both header entrances, preview open/Esc, close→cancel+focus, approve/reject payloads) plus rendered screenshots in both themes; all earlier suites, typecheck and the three-layer i18n check still pass.
- **计划审阅对齐 0.2.1 宿主与网页端 `PlanPreview`**。计划模式芯片改由宿主的 `plan` 投影驱动(不再只看 `plan/mode` 瞬时事件):有效态与网页端 `PlanChip` 同一折算(`pending ? !active : active`),所以刚发出 `/plan` 时显示「计划模式(切换中…)」,而且重载或切换会话后芯片仍在。最后这点是真实缺陷 —— init 路径没有重画模式芯片,之前要等下一条事件才会出现。
- 计划卡补上网页端那两个次级入口:**查看全文** 打开整页预览(渲染后的 Markdown、14px/1.75 行高、独立滚动区,Esc 或点遮罩关闭;计划已落盘到 `.dsh/plans/` 时提供 `打开计划文件`),卡片内仍保留紧凑的可滚动正文。卡片与预览里的代码块、表格现在各有自己的盒子,不再塌成正文。
- **关闭审阅去补充意见** 跟随 0.2.1 的新行为(「关闭计划审阅以补充修改意见时,直接结束当前轮次并等待用户反馈,避免额外调用模型」):新增 `关闭审阅,去补充意见` 动作,取消审阅、收起卡片、把焦点交给输入框并提示 Agent 正在等待 —— 不必再往卡片内的小输入框里挤。`确认执行` 与 `拒绝` 仍提交宿主自己给出的选项文案,卡片内的 `输入修改意见` 也仍可用。
- 验证:针对真实包写了 15 项 jsdom 夹具(投影→芯片折算、两个头部入口、预览打开/Esc、关闭→取消+聚焦、批准/拒绝载荷),并产出深色/浅色两套渲染图;既有全部夹具、typecheck 与三层 i18n 校验仍通过。


## 0.13.42
- **Plan review, question and approval cards now follow the VS Code theme instead of the old green/yellow styling.** Every待处理 card previously tinted its whole surface (plan: yellow-green `#dcdcaa`, approval: salmon, cordis: purple) and the primary button was a hard-coded GitHub green (`#2ea043`). None of those colors came from the theme, so they clashed with light themes and dropped the body text's contrast. The cards now share one neutral panel surface with a 1px theme border and a 3px left category rail — amber for tool approval, purple for plan review and plugin approval, blue for questions — while headings keep the theme foreground and only their icon carries the category color.
- Buttons got a real hierarchy: the base `btn` is the theme's secondary button (hover/focus from theme tokens, no `filter: brightness` hack), the primary action (`允许一次` / `确认执行` / `提交回答` / `仅允许此版本`) is the theme's primary button, and `拒绝` stays neutral until hover, where it turns into the theme's error tint — no more permanent red outline. The Cordis card's broader permission (`允许后续版本`) became a secondary button with a purple outline instead of a second primary, and the `✓`/`✓✓`/`✅` label prefixes are gone so color carries the emphasis.
- Readability work on the plan card: the plan body renders inside a scrollable editor-background panel with 12/14px padding, 12.5px text at 1.65 line-height, and explicit heading/list/code spacing (h1 14px, h2/h3 12.5px with breathing room, inline code in the editor font). Option rows use the theme's active-selection background when selected.
- Two genuine bugs found while doing this: the dialog's `确定` button was **never** primary — `.dialog-confirm` was defined before `.btn` and lost the cascade, so it always rendered gray (now `.btn.dialog-confirm` with the theme primary color, plus a new destructive style for `清除`); and `#dcdcaa` on session badges, plan/goal/mode chips and status dots was unreadable in light themes, so those all map to theme semantic tokens now.
- Verified visually, not just by reading CSS: the real webview bundle plus the real `chat.css` rendered in headless Chromium in both dark and light palettes, covering plan review, a question card with a selected option and countdown, a tool approval, a plugin approval, and the generic dialog. All existing jsdom suites still pass, together with typecheck and the three-layer i18n check.
- **计划待审 / 提问 / 审批卡片改为跟随 VS Code 主题,不再是以前的绿色系。** 此前每张待处理卡片都把整块表面染色(计划黄绿 `#dcdcaa`、审批橙红、插件审批紫),主按钮是写死的 GitHub 绿(`#2ea043`)—— 这些颜色都不来自主题,亮色主题下既突兀又压低正文对比度。现在所有待处理卡片共用一套中性面板底色 + 1px 主题边框 + 3px 左侧分类导轨(工具审批琥珀、计划审阅与插件审批紫、提问蓝),标题保持主题前景色,只有图标带类别色。
- 按钮有了真正的主次:基础 `btn` 就是主题的次要按钮(悬停/聚焦都用主题令牌,不再用 `filter: brightness` 糊弄),主操作(`允许一次` / `确认执行` / `提交回答` / `仅允许此版本`)用主题主按钮色,`拒绝` 平时中性、悬停才转成主题错误色 —— 不再是一圈常驻红框。插件审批里权限更宽的 `允许后续版本` 降为带紫色描边的次要按钮,并去掉 `✓`/`✓✓`/`✅` 前缀,让颜色来承担强调。
- 计划卡的可读性:正文放进可滚动的「编辑器底色」面板,内边距 12/14px,12.5px 字号、1.65 行高,并补齐标题/列表/行内代码的间距(h1 14px,h2/h3 12.5px 且上下留白,行内代码用编辑器字体);选项被选中时用主题的列表选中底色。
- 顺带修掉两个真实缺陷:对话框的 `确定` 按钮**从来都不是**主按钮 —— `.dialog-confirm` 定义在 `.btn` 之前,层叠里一直被覆盖成灰色(现在改成 `.btn.dialog-confirm` 走主题主色,并给 `清除` 补了破坏性样式);以及 `#dcdcaa` 在会话徽标、计划/目标/模式芯片与状态点上亮色主题几乎看不清,现已全部映射到主题语义令牌。
- 验证方式不只是读 CSS:用真实 webview 包 + 真实 `chat.css` 在无头 Chromium 里按深色与浅色两套配色渲染,覆盖计划待审、带选中项与倒计时的提问、工具审批、插件审批以及通用对话框。既有 jsdom 夹具全部仍通过,typecheck 与三层 i18n 校验也通过。


## 0.13.41
- **↑/↓ history recall no longer fights the caret, and no longer needs an extra press.** The old rule keyed on absolute caret offsets: "caret at index 0" for ↑ and "caret at the end" for ↓, plus a special case for text with no newline. Two things went wrong with that. A long prompt that simply *wraps* has no newline, so pressing ↑ at its end instantly replaced the whole text with the previous message — exactly the "I only wanted to move the caret" case. And inside multi-line text the caret had to be walked to the very first character before a press would recall anything, which reads as "it only switches once I reach the top".
- The trigger is now "can the caret move at all?": the keypress is left to the browser, and on key-up the input compares the caret position with the one captured on key-down. If it moved, the press only moved the caret. If it could not move (first/last visual line, wrapped or not), that same press recalls history — no extra press. Text edits, blur, an open slash or mention popup, IME composition and shift-selection all cancel the pending decision, so nothing fires late or in the wrong context.
- **Ctrl/Alt + ↑/↓ recalls immediately from anywhere**, and a new setting `dsh.historyKey` (Settings → ⌨️ Sending & input) picks the plain-arrow policy: `edge` (default, as described), `always` (every press recalls — for people who want one-press switching and will move the caret with the mouse or ←/→), or `off` (plain arrows only move the caret; the modifier combo still recalls).
- Regression proof: the same jsdom suite run against the shipped **0.13.40** bundle fails the wrap case (`82 chars → replaced by the 7-char history entry`) plus `off` and the modifier case; against this build all 13 checks pass, including "caret at the visual top → that press recalls", "middle line → caret only", "popup open → navigation only", "blur before key-up → no recall". New strings are localized in 14 languages.
- **↑/↓ 调回历史不再和光标抢按键,也不需要多按一次**。旧规则按「绝对光标位置」判断:↑ 要求光标在索引 0、↓ 要求光标在文本末尾,再给「没有换行符的文本」开了特例。这带来两个反效果:长提示词只是**自动折行**(逻辑上没有换行符),光标在末尾时按 ↑ 会立刻把整段文字替换成上一条消息 —— 正是「我只是想移动光标」的情形;而多行文本里必须先把光标一路移到第一个字符,那一次按键才会召回,用起来就像「怎么按都不切,到了顶才切」。
- 现在改成问「光标到底还能不能动」:按键先交给浏览器,松开时把光标位置和按下时的位置比对 —— 动了就只是移动光标;没动(已在视觉首行 / 末行,折行与否都算)就由**这一次**按键召回,不再需要额外一下。文本被编辑、失焦、斜杠或提及弹层打开、输入法组合中、Shift 选区,都会取消这次待判定,不会延迟误触发。
- **Ctrl/Alt + ↑/↓ 在任何位置都立即召回**;新增设置 `dsh.historyKey`(设置 → ⌨️ 发送与输入)决定普通方向键的策略:`edge`(默认,如上)、`always`(每次按键都召回 —— 想要「一按就切换」、光标用鼠标或 ←/→ 移动的人选它)、`off`(普通方向键只移动光标,组合键仍可召回)。
- 回归证明:同一份 jsdom 夹具对着**已发布的 0.13.40** 包运行,折行那一项失败(`82 字符 → 被 7 字符历史项替换`),`off` 与组合键两项也失败;对着本版本 13 项全通过,含「已在视觉首行 → 这一次按键就召回」「中间行 → 只移动光标」「弹层打开 → 只导航」「松开前失焦 → 不召回」。新增文案已补齐 14 种语言。


## 0.13.40
- **DSH 0.2.1-rc.1 compatibility, verified against the published host.** The wire contract the extension uses is unchanged: all 57 endpoints keep their signatures, the `remote.mux` streams and the `dsh-auth-*` browser cookie are untouched, and the `$events` vocabulary only gained `plugin-market/changed` (the `api-session/*` events gained resource clauses, but an owner connection — this extension's launch-token cookie — still receives all of them; measured live). Removed endpoints (`terminal/follow|write|resize`) were never used here; the new optional ones (`cotTranslation/*`, `pluginMarket/*`) 404 unless their bundle is composed, so they degrade as "endpoint unavailable".
- New features adopted from 0.2.1: the **session working directory** (`workingDirectory` projection + `working-directory/change` event) is shown as a composer pill that reveals the folder, and directory switches appear in the transcript as one-line notices; the host's `user/message` with `source.kind="working-directory"` is no longer rendered as something the user said. Pending **timed questions** are restored from the `userQuestions` projection after a reload or session switch (previously they vanished until the agent continued). The **background-jobs panel** is now fed by the new `job/registered` / `job/settled` session events with status, exit code and duration — `session/control` baselines carry only projections on 0.2.x, so the panel had no data source before. Session ⋯ gained **Copy session ID**.
- **Gateway authorization (`remoteAccess/follow`)**: the extension probes the new stream once, records whether this connection is `owner`, warns when a host grants limited access, and turns `remote-access/denied` into a readable permission message instead of a raw code.
- **Bundled plugin compatibility fix**: DSH 0.2.1 rejects plugins whose declared requirements the runtime does not satisfy, and `dsh-git-rollback@0.1.10` only declared `^0.1.0-rc.6` peers — the host's own evaluator flags that as incompatible on 0.2.0-rc.2 **and** 0.2.1-rc.1. v0.1.11 declares `engines.dsh: ">=0.1.7-rc.2"`, adds an icon and `locale/*.json` entries for 15 languages, so it loads clean and shows a localized title/description in the plugin manager.
- Verification: live probes against isolated 0.2.1-rc.1 and 0.2.0-rc.2 servers (contract 16/18 — the two failures are the optional bundles' 404s; 0.2.1 store integration 6/6; 0.2.0 backward compatibility 9/9 including graceful absence of the new projection/events), a plugin-metadata read from a real 0.2.1 plugin manager, `tools/test-plugin-engines.mjs` for the compatibility gate, plus jsdom interaction harnesses for the new UI paths. All new strings are localized in 14 languages, and the older harnesses (compaction, stats, send shortcut, attachments) still pass.
- **兼容 DSH 0.2.1-rc.1(对着已发布宿主实机核对)**。扩展用到的线协议没有变化:57 个端点签名全部不变,`remote.mux` 流派与 `dsh-auth-*` cookie 不变,`$events` 词表只多了 `plugin-market/changed`(`api-session/*` 增加了 resources 子句,但 owner 连接 —— 即本扩展用启动令牌换来的 cookie —— 实测仍全量收到)。移除的 `terminal/follow|write|resize` 本扩展从未使用;新增的 `cotTranslation/*`、`pluginMarket/*` 在未组合对应插件时返回 404,按「端点不可用」优雅降级。
- 采纳 0.2.1 的新功能:**会话工作目录**(`workingDirectory` 投影 + `working-directory/change` 事件)显示为输入框下方的目录胶囊(点击在资源管理器中定位),目录切换同时以单行提示出现在对话里;宿主注入的 `user/message`(`source.kind="working-directory"`)不再被渲染成用户发言。重载视图或切换会话后,**待答的限时提问**由 `userQuestions` 投影还原(此前会消失,直到 Agent 自己继续)。**后台任务面板**改由新的 `job/registered` / `job/settled` 事件驱动,带状态、退出码与耗时 —— 0.2.x 的 `session/control` 基线只携带 projections,面板此前没有数据来源。会话 ⋯ 菜单新增**复制会话 ID**。
- **网关授权(`remoteAccess/follow`)**:启动时探测一次新流,记录本连接是否为 `owner`;宿主只授予受限访问时给出提示,并把 `remote-access/denied` 翻成可读的权限说明,而不是原始错误码。
- **随包插件兼容修复**:DSH 0.2.1 会拒绝运行时不满足其声明要求的插件,而 `dsh-git-rollback@0.1.10` 只声明了 `^0.1.0-rc.6` 的 peer 范围 —— 用宿主自己的求值器实测,这在 0.2.0-rc.2 **与** 0.2.1-rc.1 上都被判为不兼容。v0.1.11 增加 `engines.dsh: ">=0.1.7-rc.2"`、图标与 15 种语言的 `locale/*.json`,现在加载无告警,插件管理里显示本地化的标题与描述。
- 验证:对隔离的 0.2.1-rc.1 与 0.2.0-rc.2 服务器做实机探针(契约 16/18,两项失败是可选项组合包的 404;0.2.1 存储集成 6/6;0.2.0 向后兼容 9/9,含新投影/事件缺失时的优雅降级)、从真实 0.2.1 插件管理读出插件元数据、`tools/test-plugin-engines.mjs` 校验兼容门禁,另有 jsdom 交互夹具覆盖新界面路径。新增文案已补齐 14 种语言;既有的压缩行 / 统计胶囊 / 发送快捷键 / 附件夹具全部仍通过。


## 0.13.39
- Attachments in the composer are now clickable: clicking a **file** chip opens it (text-like files in the editor with the usual HEAD→worktree diff for tracked files, images/PDF/archives/executables through the VS Code viewer instead of the old "open a PNG as text" path), clicking a **folder** chip reveals it in the file explorer, and clicking an **image** chip opens a full-size preview (Escape or clicking the backdrop closes it, with "open with the default app" saving it to a temp file first). Right-clicking a file/folder chip offers View file / Open with default app / Reveal in File Explorer / Remove attachment; the × still removes only and never opens anything. The chips show a pointer cursor and underline their label on hover so they read as clickable.
- Root cause of the old behaviour: `openFile` always went through `openTextDocument`, so a binary attachment either errored or was shown as text; the host now classifies by extension (`isTextLikePath`) and routes non-text files to `vscode.open`.
- Tests kept in the repo: `tools/test-open-routing.mjs` (20 extension→route assertions) and a jsdom interaction harness covering file/folder/image clicks, the right-click menu, remove-only behaviour and the preview overlay. All new strings are localized in 14 languages.
- 输入区的附件现在可点击查看:点**文件**芯片即打开(文本类走编辑器、已跟踪文件仍是 HEAD→工作区 diff;图片/PDF/压缩包/可执行文件改走 VS Code 默认查看器,不再出现「把 PNG 当文本打开」的老问题),点**文件夹**芯片在资源管理器中定位,点**图片**芯片打开原尺寸预览(Esc 或点遮罩关闭,弹层内「用默认应用打开」会先把图片写成临时文件)。文件/文件夹芯片右键给出 查看文件 / 用默认应用打开 / 在资源管理器中显示 / 移除附件;× 依旧只移除、绝不触发打开。芯片加了指针光标,悬停时文件名会加下划线,一眼看出可点。
- 旧行为的原因:`openFile` 一律走 `openTextDocument`,二进制附件要么报错、要么被当文本显示;宿主现在按扩展名判定(`isTextLikePath`),非文本文件交给 `vscode.open`。
- 测试留在仓库:`tools/test-open-routing.mjs`(20 条扩展名→路由断言)+ 一份 jsdom 交互夹具(文件/文件夹/图片点击、右键菜单、只移除不打开、预览弹层开关)。所有新文案已补齐 14 种语言。


## 0.13.38
- **Fixed the bottom stat pills collapsing to one, and only showing up after switching sessions.** The host pushes `sessionStats` and `tokenUsage` as two separate `stats` messages, each carrying exactly one key; the webview assigned the whole object (`state.stats = msg.value`), so whichever arrived last erased the other — the familiar symptom is a lone `2 turns 101 steps` pill with no token pill until a session switch re-sent the merged snapshot. The handler now merges per field, so both projections survive in either arrival order.
- The pills no longer depend on the projection arriving at all: the derived path (from session events) now also accumulates token usage from each `assistant/message`'s `usage`, and the row refreshes when an assistant message or tool result lands — so the row becomes visible **during** a turn instead of only at `turn/end`.
- Regression test kept in the repo: `tools/test-stats-merge.mjs` (7 checks — both arrival orders, init snapshot, each projection alone, foreign-session ignore, and the derived-only path with no projection), driven through the real webview bundle in jsdom.
- **修复底部统计胶囊只剩一枚、且只有切换会话后才出现**。宿主把 `sessionStats` 与 `tokenUsage` 分成两条 `stats` 消息推送,每条只带一个键;webview 却是整对象赋值(`state.stats = msg.value`),于是后到的那条把先到的抹掉 —— 典型表现就是只剩一枚「2 轮 101 步」,看不到 token 胶囊,直到切换会话重推合并快照才恢复。现在改为按字段合并,两种到达顺序下两条投影都保留。
- 胶囊不再依赖投影到达:派生路径(由会话事件推导)现在也会累加每条 `assistant/message` 自带的 `usage`,并在助手消息或工具结果落地时刷新统计行 —— 因此**回合进行中**就能看到,而不必等 `turn/end`。
- 回归测试留在仓库里:`tools/test-stats-merge.mjs`(7 项 —— 两种到达顺序、init 快照、各自单独出现、忽略其它会话、完全无投影的派生路径),全部用真实 webview 包在 jsdom 中驱动。


## 0.13.37
- **Fixed the conversation ending with a permanent "Compacting context…" row** (the running compaction line that survived an already-finished turn). Root cause, measured on a live 0.2.0-rc.2 server: the host changed the compaction checkpoint marker — a finished compaction now writes its checkpoint as `user/message` with `source = {kind:"compact-checkpoint", compactionId, sourceCommandId?}`, while the extension still recognized the old `{kind:"plugin", plugin:"compact"}` shape. `MessageSourceMap` explicitly documents that there is no shared catch-all `plugin` kind any more, so the check matched nothing, the row was never marked done, and it kept its running sweep at the tail of the transcript.
- The checkpoint check now accepts both markers, and two independent fallbacks make the row impossible to strand: `compaction/end` closes a successfully compacted row (previously it only handled the error case), and a turn boundary closes any auto-compaction row still marked running.
- Verified two ways. ① Live capture: a real `/compact` run produced `compaction/start` → `compaction/summary` → `user/message` checkpoint with exactly `{"kind":"compact-checkpoint",…}` → `compaction/end`, and a failed compaction produced `compaction/end` with `error`. ② Replay through the real webview bundle: the pre-fix code renders `data-state=running` with `正在压缩上下文…` for that exact sequence (bug reproduced), the fixed code lands on `data-state=done`; both checkpoint markers pass, a missing checkpoint is recovered by `compaction/end`, a failed compaction still lands on `error`, and auto-compaction (no `sourceCommandId`) plus a turn-boundary fallback both converge to done.
- **修复对话结束后仍在最底部留一条「正在压缩上下文…」**。根因(在真实 0.2.0-rc.2 服务器上实测):宿主改了压缩检查点的来源标记 —— 压缩完成时写入的 `user/message` 现在带 `source = {kind:"compact-checkpoint", compactionId, sourceCommandId?}`,而扩展仍在按旧的 `{kind:"plugin", plugin:"compact"}` 匹配。`MessageSourceMap` 已明确不再有共享的 `plugin` 兜底类型,于是判定全部落空:压缩行永远不会被标成完成,尾部就一直挂着运行中的扫光。
- 检查点判定现在同时接受新旧两种标记,并加了两道独立兜底,使这一行不可能再卡住:① `compaction/end` 在**成功**时也收尾(此前只处理失败分支);② 回合边界会把任何仍标着「运行中」的自动压缩行收敛为完成。
- 两路验证:① 实拍 —— 真实 `/compact` 产生 `compaction/start` → `compaction/summary` → 带 `{"kind":"compact-checkpoint",…}` 的 `user/message` 检查点 → `compaction/end`;压缩失败时 `compaction/end` 带 `error`。② 用真实 webview 包回放:修复前的代码对该序列渲染出 `data-state=running` +「正在压缩上下文…」(缺陷复现),修复后落到 `data-state=done`;新旧两种标记都通过、缺检查点时由 `compaction/end` 收尾、失败仍落到 `error`、自动压缩(无 `sourceCommandId`)与回合边界兜底都收敛为完成。


## 0.13.36
- The send shortcut no longer occupies a header button: the ⌨️ entry was removed from the toolbar and the setting now lives only in **Settings → ⌨️ Sending & input** (General tab), alongside the composer font and the produced-file collapse toggle. The status pill on the composer hint line stays — it shows the active mode (`Enter 发送` / `Ctrl+Enter 发送` / `Shift+Enter 发送`) and still switches on click, so the current binding stays visible without adding another toolbar icon.
- Verified: the header row renders six buttons again (workspaces, jobs, automation tasks, trajectory, settings, subagents), the pill and hint still follow `dsh.sendKey`, and all three modes were re-asserted through the jsdom harness.
- 发送快捷键不再占用头部按钮:⌨️ 入口已从工具栏移除,设置只保留在**设置 →「⌨️ 发送与输入」**(常规页),与输入区字体、产物文件折叠开关同处一区。输入框提示行旁的胶囊保留 —— 它显示当前模式(`Enter 发送` / `Ctrl+Enter 发送` / `Shift+Enter 发送`)并且仍可点击切换,这样既不占头部图标,又能一眼看到当前键位。
- 已核对:头部恢复为六个按钮(工作区 / 后台任务 / 自动化任务 / 轨迹 / 设置 / 子代理),胶囊与提示行仍跟随 `dsh.sendKey`,三种模式已用 jsdom 夹具重新断言通过。


## 0.13.35
- The send shortcut is now switchable from the UI itself, not only from `settings.json`: the hint line under the composer carries a small pill with the current mode (`Enter to send` / `Ctrl+Enter to send` / `Shift+Enter to send`) that switches on click, and a ⌨️ header button opens a menu listing all three modes plus a jump into Settings. Both write `dsh.sendKey` globally and take effect in the input box immediately — a reader who is used to Enter-for-newline can move to Ctrl+Enter-to-send in one click and stop sending half-typed messages by accident.
- The Settings panel's General tab gained a `⌨️ Sending & input` section above the host namespaces: the three send modes with their exact Enter / Shift+Enter semantics, the composer font (`dsh.uiFontFamily`, empty follows the VS Code UI font), and the produced-file list collapse toggle (`dsh.autoCollapseProducedFiles`).
- Verified with a jsdom harness that drives the real webview bundle: under `dsh.sendKey=enter` only bare Enter sends, under `ctrl-enter` only Ctrl+Enter sends, under `shift-enter` only Shift+Enter sends — all three modes asserted against all three key combinations, plus the pill text and hint line following the active mode. All new strings are localized in 14 languages.
- 发送快捷键现在可以直接在界面里切换,不必只改 `settings.json`:输入框下方提示行多了一枚胶囊显示当前模式(`Enter 发送` / `Ctrl+Enter 发送` / `Shift+Enter 发送`),点一下即切换;头部新增 ⌨️ 按钮,菜单里列出三种模式并可直接跳到设置。两处都会全局写入 `dsh.sendKey` 并立即在输入框生效 —— 习惯用 Enter 换行的人一次点击就能改成 Ctrl+Enter 发送,不会再手滑把没写完的消息发出去。
- 设置面板常规页新增「⌨️ 发送与输入」分区(排在各宿主命名空间之上):三种发送模式及其 Enter / Shift+Enter 的确切语义、输入区字体(`dsh.uiFontFamily`,留空跟随 VS Code 界面字体)、产物文件列表默认折叠开关(`dsh.autoCollapseProducedFiles`)。
- 已用 jsdom 夹具驱动真实 webview 包验证:`dsh.sendKey=enter` 时只有裸 Enter 发送、`ctrl-enter` 时只有 Ctrl+Enter 发送、`shift-enter` 时只有 Shift+Enter 发送 —— 三种模式 × 三种按键组合全部断言,并断言胶囊文案与提示行跟随当前模式。所有新文案已补齐 14 种语言。


## 0.13.34
- **Generate Commit Message can no longer leave your default model on the commit setting.** Diagnosis first: `session/selectModel` does two separate things — it installs the model for that session's next request **and** saves the profile default in the background (the host logs a failed background save to its own log, where the extension cannot see it). The existing restore already worked on the happy path (verified end-to-end against 0.2.0-rc.2: user `v4-pro/max` → commit `flash/low` → restored `v4-pro/max` in the profile), so the remaining holes were the paths where the restore is *silent*: (1) if the original selection could not be read, the extension switched the model anyway and had nothing to restore with — it now refuses to switch at all in that case; (2) a failed restore was only written to the console — it now reads the selection back, retries once, and shows a warning naming the model it could not restore; (3) `reasoningEffort` comparison and capture are now case-insensitive and drive an explicit "did my restore take effect" check, so an effort-only difference can no longer slip through.
- Also fixed the reasoning-effort gate: a model whose reasoning efforts are declared by `name` (ids empty, as some upload probes do) no longer loses the configured effort — it is treated as supporting it, matching how the web client renders efforts.
- Regression: `tools/test-commit-model-restore.mjs` (9 checks over the capture/restore logic) plus a live end-to-end pass (`tmp/probe-commit-flow-e2e.mjs`) asserting the profile ends on the user's original selection.
## 0.13.34
- **「生成提交消息」不会再把你的默认模型留在提交档上。** 先给诊断结论:宿主 `session/selectModel` 做的是两件事 —— 把模型装到该会话的下一次请求,**同时**在后台保存 profile 默认值(后台保存失败只写进宿主自己的日志,扩展看不到)。原有恢复在正常路径上是对的(已对 0.2.0-rc.2 端到端实测:用户 `v4-pro/max` → 提交档 `flash/low` → profile 恢复为 `v4-pro/max`),所以剩下的漏洞都在「恢复是静默的」这条路径上:① 读不到原值时代码仍会切换模型、却没有东西可恢复 —— 现在这种情况直接不切换;② 恢复失败只写 console —— 现在会读回校验、重试一次,仍失败就弹告警并写明无法恢复的模型;③ `reasoningEffort` 的比较与捕获改为大小写无关,并作为「恢复是否真的生效」的判定依据,只差思考深度的情况不会再漏过。
- 同时修掉思考深度判定:能力只以 `name` 声明(ids 为空,部分上传探测如此)的模型不再丢掉配置的思考深度,而是按「支持」处理,与网页端渲染一致。
- 回归:`tools/test-commit-model-restore.mjs`(捕获/恢复逻辑 9 项)+ 真实端到端(`tmp/probe-commit-flow-e2e.mjs`)断言 profile 最终等于用户原选择。
## 0.13.33
- **Fixed the read/write permission dropdown being unusable.** The picker took its option list from the session's `permissions` projection, but that projection only carries the **current value** — in 0.2.0-rc.2 it is literally `{"currentValue":"workspace-write"}` with no `options` at all (measured on a live server). With an empty option list the pill's expand button was disabled, so nothing could be chosen. The extension now reads the option list from the process-level `permissionPresets/catalog` endpoint — exactly the split the official web client uses (`selection = projection`, `catalog = options`) — caches it per connection, and re-pushes the merged value once it arrives, at startup and on every session follow. If a host has no catalog endpoint, it falls back to whatever options the projection carries, so older deployments keep working. Verified live: catalog returns `read-only / workspace-write / danger-full-access` while the projection returns only the current value, and the merged result is a 3-option list.
- **修复「读写权限」下拉无法选择的问题。** 下拉的选项列表原本取自会话的 `permissions` 投影,但该投影只携带**当前值** —— 在 0.2.0-rc.2 上实测它形如 `{"currentValue":"workspace-write"}`,完全没有 `options`。选项为空时胶囊的展开按钮是 disabled 状态,于是什么都选不了。现在选项改为取自进程级的 `permissionPresets/catalog` 端点 —— 与官方网页端完全相同的分工(`selection = 投影`、`catalog = 目录`)—— 按连接缓存一次,并在启动时与每次会话 follow 后把「目录选项 + 投影当前值」合并重推;宿主没有该端点时回退到投影自带 options,旧部署不受影响。已实测:目录返回 `read-only / workspace-write / danger-full-access` 而投影只有当前值,合并结果为 3 个可选项。

## 0.13.32
- **A turn that runs out of context now says so, in the conversation** ([issue #19](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/19)): with a smaller-window model (MiniMax and other pi-ai routes) the context filled up and the conversation simply stopped, with nothing but a short-lived toast. Three separate signals were being dropped, all of them on the extension side: `turn/end`'s `reason` was ignored, the `api-session/error` event reached only `waitIdle` and no UI at all, and nothing warned before the window was full. Now:
  - **Failure card in the transcript**: a turn that ends with `reason.kind = "error"` (or `max-tokens`) leaves a card at the end of that turn with the failure code and the provider's own message. Context-overflow failures are recognised from the structured `code = CONTEXT_WINDOW_EXCEEDED` **or** from the provider text (`context length` / `prompt is too long` / `too many tokens` …), and the card shows the current reading (`~210K / 200K tokens`) with **Compact context** (`/compact`) and **Switch model** buttons. Cards replayed from history carry no buttons — they describe a past turn, not the current one.
  - **`api-session/error` reaches the user**: a failed turn in the session you are looking at now raises an error notice (truncated to 400 chars). Failures in other sessions stay quiet and are signalled by the session-list dot.
  - **Warnings before it is too late**: the context ring turns amber at 75% and red at 90% (web-parity panel gains a **Compact context** action; the tooltip explains why), and sending while the next request is estimated to cross 90% of the window adds an in-conversation card with the projected reading plus the same two actions — the send itself is never blocked, because the host's `compaction-basic` compacts and retries on its own at its 80% threshold.
- New regression tests: `tools/test-context-overflow-alert.mjs` (37 checks over the webview: card rendering and wording, code- and text-based overflow recognition, generic failures, `max-tokens`, replay idempotence, ring tiers, the pre-send guard) and `tools/test-agent-error-notice.mjs` (host side: current session notifies, other sessions stay quiet). UI copy added in all 14 languages.
- **上下文用尽不再「悄无声息地失败」,原因直接写进对话**([issue #19](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/19)):使用窗口较小的模型(MiniMax 等 pi-ai 路由)时,上下文填满后对话就停在那里,只有一条转瞬即逝的浮动提示。根因是三条信号都被丢掉了,而且都在扩展侧:`turn/end` 的 `reason` 没人读、`api-session/error` 只喂给了 `waitIdle`(界面完全收不到)、以及窗口被填满之前没有任何预警。现在:
  - **对话内的失败卡**:回合以 `reason.kind = "error"`(或 `max-tokens`)结束时,在该回合末尾留下一张卡片,写明失败码与提供方原文。上下文超限既按结构化 `code = CONTEXT_WINDOW_EXCEEDED` 识别,**也**按提供方文本(`context length` / `prompt is too long` / `too many tokens` 等)兜底;卡片给出当前读数(`~210K / 200K tokens`)以及**压缩上下文**(执行 `/compact`)与**切换模型**两个按钮。历史重放出来的卡片不带按钮 —— 它描述的是过去那个回合,不该对当前会话执行命令。
  - **`api-session/error` 能到用户眼前**:当前正在查看的会话失败时会弹出错误提示(超长截断到 400 字);其他会话的失败保持安静,由会话列表的未读点提示。
  - **来不及之前先提醒**:上下文进度环 75% 转琥珀、90% 转红(面板内新增「压缩上下文」动作,悬停提示说明原因);当本次输入预计让请求越过窗口 90% 时,发送前在对话内落一张卡片,给出预计读数与同样两个动作 —— 但从不阻断发送,因为宿主 `compaction-basic` 会在自己的 80% 阈值处自动压缩并重试。
- 新增回归测试:`tools/test-context-overflow-alert.mjs`(webview 侧 37 项:卡片渲染与文案、结构化 code 与纯文本两种超限识别、普通失败、`max-tokens`、重放幂等、进度环分档、发送前守卫)与 `tools/test-agent-error-notice.mjs`(宿主侧:当前会话提示、其他会话不打扰)。新增文案已覆盖全部 14 种语言。

## 0.13.31
- **Fixed the blank `ptc` entry in the Agent-preset dropdown.** DSH 0.2.0 renamed its built-in preset `code` → `ptc`, and `agentPresets/list` publishes only `id`/`order`/`isDefault` for shipped presets — the name and description come from the client's own dictionary. The extension's built-in table still listed `code`, so `ptc` fell through to the raw id with no description. `ptc` is now a first-class entry ("PTC 模式" / "PTC mode") with its description, the old `code` id is kept as an alias for older deployments, and the copy for all four shipped presets was refreshed to match DSH 0.2.0's own wording (standard / ptc / minimal / cordis) in all 14 languages.
- Verified against a live 0.2.0-rc.2 roster (`{"presets":[{"id":"standard","isDefault":true},{"id":"ptc"},{"id":"minimal"},{"id":"cordis"}]}`): every row now renders a name **and** a description in zh-cn, en and ja.
- **修复 Agent 预设下拉里「ptc」只有名字、没有说明的问题。** DSH 0.2.0 把内置预设 `code` 改名为 `ptc`,而 `agentPresets/list` 对内置预设只下发 `id`/`order`/`isDefault` —— 名称与说明来自客户端词典。扩展的内置表里还是 `code`,于是 `ptc` 落到了「用原始 id 当名字、且没有说明」的回退分支。现在 `ptc` 已是正式条目(「PTC 模式」/「PTC mode」)并带上说明;旧 id `code` 保留为别名以兼容旧部署;四个内置预设(标准 / PTC / 极简 / 创造)的文案也同步到 DSH 0.2.0 官方措辞,覆盖全部 14 种语言。
- 已用真实 0.2.0-rc.2 的 roster 实测(`{"presets":[{"id":"standard","isDefault":true},{"id":"ptc"},{"id":"minimal"},{"id":"cordis"}]}`):zh-cn、en、ja 三种语言下四行都能显示**名称 + 说明**。

## 0.13.30
- Adopted the accepted items from [issue #21](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/21):
  - **`dsh.sendKey`** (#1): choose whether Enter sends (default), Ctrl+Enter sends, or Shift+Enter sends — the other combination then inserts a newline. The hint line under the composer follows the setting, and the `@`-mention / slash popups keep accepting Enter to pick a row.
  - **`dsh.uiFontFamily`** (#7): the chat panel now takes any CSS font stack, so Windows users can put `"Microsoft YaHei UI", "Microsoft YaHei", sans-serif` first for comfortable Chinese glyphs. Empty (default) keeps following the VS Code UI font; code and diff blocks keep the editor font.
  - **`dsh.newSessionOnStartup`** (#5): opening the panel creates an empty session automatically instead of waiting for a click on ＋.
  - **`dsh.rememberLastSession`** (#5): each workspace remembers its last session and restores it on the next window, unless that session is archived, gone, or held by another DSH instance.
  - **`dsh.autoCollapseProducedFiles`** (#10): the produced-files list starts as one summary line (`产物 (4)  a.ts · b.ts · c.ts ＋1`) that expands on click, with an internal scroll area, and deliverable cards are capped in height — a long session no longer gets buried under the previous turn's artifacts.
  - **Popovers always close** (#9): the subagent catalog, goal menu, model menu and subagent preview now close on any outside click, Esc, scroll, or window blur, instead of relying on a single one-shot click handler that could be swallowed.
  - **Queued messages get a real editor** (#11): editing a queued message opens a 6-row, vertically resizable textarea (Enter for newlines, Shift/Ctrl+Enter to confirm, Esc to cancel) instead of a one-line input.
- Already shipped earlier in this line, so nothing further was needed: ↑/↓ input history (#4, 0.13.28), cache-hit/token figures at the bottom instead of only at turn end (#6, 0.13.17). Item #3 (a message lost while the model rejects images) is now covered by the send-failure handling: the composer text is restored and a notice explains the cause, and #2/#8 remain upstream/host-side (image capability comes from the model catalog, not the extension).
- 采纳 [issue #21](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/21) 中可落地的建议:
  - **`dsh.sendKey`**(第 1 条):可选 Enter 发送(默认)/ Ctrl+Enter 发送 / Shift+Enter 发送,另一组合键即换行。输入框下方提示行会跟随该设置显示,`@` 提及与斜杠命令弹层仍以 Enter 选中当前项。
  - **`dsh.uiFontFamily`**(第 7 条):聊天面板支持任意 CSS 字体栈,Windows 用户可把 `"Microsoft YaHei UI", "Microsoft YaHei", sans-serif` 放在最前,中文字形更舒服;留空(默认)继续跟随 VS Code 界面字体,代码与 diff 区域仍用编辑器等宽字体。
  - **`dsh.newSessionOnStartup`**(第 5 条):打开面板即自动新建一个空会话,不必先点「＋」。
  - **`dsh.rememberLastSession`**(第 5 条):按工作区记住上次使用的会话,下次开窗自动恢复;若该会话已归档、已删除或被其他 DSH 实例占用,则自动退回新建。
  - **`dsh.autoCollapseProducedFiles`**(第 10 条):产物文件列表默认折叠成一行摘要(`产物 (4)  a.ts · b.ts · c.ts ＋1`,点击展开),展开后列表内部滚动;交付卡也限制了高度与宽度 —— 长对话不再被上一轮的产物占满。
  - **弹层一定能收起**(第 9 条):子代理目录、目标菜单、模型菜单、子代理预览改为「点击外部 / Esc / 滚动 / 窗口失焦」任一方式都可关闭,不再依赖可能被吞掉的一次性点击监听。
  - **排队消息可从容编辑**(第 11 条):编辑排队消息改为 6 行、可纵向拖拽的编辑框(Enter 换行,Shift/Ctrl+Enter 确认,Esc 取消),不再是一行输入框。
- 以下条目此前已实现,本次无需改动:↑/↓ 调回历史输入(第 4 条,0.13.28)、缓存命中率与会话 token 固定在底部(第 6 条,0.13.17)。第 3 条(带图片发送后消息丢失)现已由发送失败处理覆盖:失败时保留输入内容并说明原因;第 2、8 条属宿主/上游能力(图片能力由模型目录声明,不由扩展决定)。

## 0.13.29
- **Diagnosed the `session/writer-held` failure** ("session … is already owned by an active write handle") that appears when the model is switched while another DSH instance is running. It is not a model bug and not specific to the desktop app: DSH sessions are owned by one writer at a time. Running two instances against the same DSH home (the desktop app plus `dsh web`, two `dsh web` processes, or the extension's auto-started server alongside either) means the instance that attached a session first keeps its write handle, and every write from the other one — switching the model, renaming, sending a message — is refused with that error. Reproduced deterministically with two independent servers over one isolated home: `selectModel`, `renameSession` and `sendPromptParts` all come back `code=session/writer-held`.
- **The extension now explains it instead of showing the raw error**: a write refused with `session/writer-held` is reported as "this session is held by another running DSH instance (the desktop app or another dsh web) — switch to another session, or quit that instance and retry", in all 14 languages, and a persistent notice bar appears above the composer for as long as that session is locked. The bar clears by itself as soon as any write to the session succeeds (for example after quitting the other instance). The same handling covers model switching, renaming and sending.
- **定位了 `session/writer-held` 报错**("session … is already owned by an active write handle",切换模型时出现的那个)。它既不是模型的问题,也不专属于桌面端:**DSH 的会话同一时刻只允许一个写入方**。当同一 DSH 主目录下同时跑着两个实例(桌面端 + `dsh web`、两个 `dsh web`,或扩展自动启动的服务器与其中任一个并存)时,先挂上该会话的一方持有写句柄,另一方的所有写操作 —— 切换模型、重命名、发送消息 —— 都会收到这个错误。已用「同一隔离主目录 + 两个独立服务器进程」稳定复现:`selectModel`、`renameSession`、`sendPromptParts` 全部返回 `code=session/writer-held`。
- **扩展改为解释清楚,而不是抛原始报错**:凡因 `session/writer-held` 被拒的写操作,都会提示「当前会话已被其他正在运行的 DSH 实例占用(桌面端或另一个 dsh web),请在 VS Code 里换一个会话,或退出该实例后重试」(14 种语言),同时在输入框上方显示常驻提示条;只要该会话任意一次写操作成功(例如退出另一端后),提示条会自动消失。切模型、重命名、发送消息三条路径都已覆盖。

## 0.13.28
- **↑ / ↓ now recall previous inputs** in the composer, implementing [issue #20](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/20): press ↑ to walk back through everything you have sent (like a shell), ↓ to walk forward, and ↓ past the newest entry (or Esc) restores the draft you were typing before you started browsing. Up to 50 entries are kept, consecutive duplicates are not stacked, and the history is persisted in the webview state so hiding or reloading the view keeps it.
- It never gets in the way of editing: ↑ only takes over with the caret at the start of the first line, or in a single-line input (where ↑/↓ have nothing to scroll); inside multi-line text the arrow keys still move the caret, an IME composition (Chinese/Japanese/Korean input) is never intercepted, and the mention (`@`) and slash (`/`) popups keep their own arrow-key navigation. Editing a recalled entry keeps your edit instead of having ↓ overwrite it, and a small `历史 2/5` pill appears next to the activity line while you browse.
- **输入框支持 ↑ / ↓ 调回之前发送过的内容**,实现 [issue #20](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code/issues/20):`↑` 逐条回溯历史输入(与终端一致),`↓` 前进,越过最新一条(或按 `Esc`)即恢复进入历史前正在编辑的草稿。最多保留 50 条,连续重复不重复入栈;历史写入 webview 状态,视图隐藏或重载后仍在。
- 不干扰编辑:只有光标位于首行行首、或输入为单行(此时 ↑/↓ 本就没有可滚动的行)时才接管;多行文本中方向键仍只移动光标;输入法组合(中/日/韩输入)期间不拦截;`@` 提及与 `/` 命令弹层继续使用自己的方向键导航。调回后手动编辑的内容不会被 `↓` 覆盖,浏览历史时活动行右侧会出现 `历史 2/5` 小胶囊。

## 0.13.27
- **Compatible with DSH 0.2.0-rc.2** (the new `latest`): the external contract this extension speaks is unchanged between 0.1.7-rc.2 and 0.2.0-rc.2. A mechanical diff of every published package's Typert Remote declarations found **164 → 171 endpoints with zero removals and zero signature changes**, an identical forwarded-host-event allowlist and session-event vocabulary, and the same session format generation; only two projection keys were added (`userQuestions`, `callId`). Verified live against a real 0.2.0-rc.2 server: 13/13 client checks pass (auth + cookie exchange, `$events` ready frame, session list/create, projection baseline, feedback, permission catalog, commands/model catalog/skills, archive) and a full message → tool → response turn completes with `turn/end {kind:"completed"}`.
- **Adopted 0.2.0's asynchronous questions**: when a question arrives with timing (`wait: {callId, timed: true}`), the card now shows a live countdown pill (`{n}s 后继续`) driven by the new `userQuestions/attachWait` stream, and the answer is submitted through `userQuestions/answer` — so a question that times out no longer blocks the agent, and your late answer is still delivered as a follow-up message. The card switches to "等待已结束 · 可稍后回答" when the wait expires instead of disappearing, plain (untimed) questions are untouched and keep using the 0.1.x `$events/result` path, and hosts without the new endpoints fall back silently.
- Model catalog note: 0.2.0 moved the third-party catalog to pi-ai 0.87.1 and dropped some older model IDs. `dsh.commitModel` is matched as a keyword against the live catalog (default `flash`) and falls back to the session's current model, so no manual reconfiguration is needed here.
- **兼容 DSH 0.2.0-rc.2**(新的 `latest`):扩展所讲的外部契约在 0.1.7-rc.2 → 0.2.0-rc.2 之间没有变化。对全部已发布包的 Typert Remote 声明做机械比对,结果为 **端点 164 → 171、零移除、零签名变化**,转发主机事件白名单与会话事件词表完全一致,会话格式世代相同;仅新增两个投影键(`userQuestions`、`callId`)。并在真实 0.2.0-rc.2 服务器上实测:客户端 13/13 项检查通过(认证与 cookie 交换、`$events` ready 帧、会话列表/新建、投影基线、反馈、权限目录、命令/模型目录/技能、归档),完整「消息 → 工具 → 回复」回合以 `turn/end {kind:"completed"}` 结束。
- **接入 0.2.0 的异步问答**:当提问带有时限描述符(`wait: {callId, timed: true}`)时,卡片会显示实时倒计时胶囊(`{seconds}s 后继续`,数据来自 0.2.0 新增的 `userQuestions/attachWait` 流),作答改走 `userQuestions/answer` —— 提问超时不再卡住 Agent,你的迟到回答仍会作为后续消息送达;等待到期后卡片转为「等待已结束 · 可稍后回答」而不是直接消失。无限时的普通提问完全不变,仍走 0.1.x 的 `$events/result` 通道;没有这些新端点的旧宿主会静默回退。
- 模型目录提示:0.2.0 把第三方目录升级到 pi-ai 0.87.1 并移除了部分旧型号。`dsh.commitModel` 按关键字与实时目录匹配(默认 `flash`),匹配不到则回退到会话当前模型,因此这里无需手工重配。

## 0.13.26
- The sidebar icon is now the **line robot** (`media/robot.svg`) instead of the orca: a rounded head outline with a short antenna and two bar eyes, drawn with the same stroke weight and rounded joins as the extension's own toolbar icons. It is used for the Activity Bar container, the Secondary Side Bar container and the chat view icon (the Marketplace logo `media/icon.png` is untouched).
- Because the mark is a monochrome outline with no fills, VS Code's container-icon treatment (mask by alpha, paint with `activityBar.inactiveForeground` / the hover foreground) keeps it crisp and correctly coloured on light, dark and high-contrast themes at any DPI; the previous orca mark stays in the repo as `media/orca.svg` but is no longer referenced.
- 侧栏图标从虎鲸换成**线条机器人**(`media/robot.svg`):圆角头框 + 短天线 + 两条竖条眼睛,描边粗细与圆角收笔与扩展自身工具栏图标一致。活动栏容器、辅助侧栏容器与聊天视图图标都使用它(市场展示用的 `media/icon.png` 不变)。
- 由于这枚标记是纯描边、无填充,VS Code 对容器图标的处理方式(按 alpha 蒙版 + 用 `activityBar.inactiveForeground` / 悬停前景色重绘)能让它在浅色 / 深色 / 高对比主题、任意 DPI 下都保持清晰且配色正确;上一版虎鲸保留在仓库里(`media/orca.svg`)但已不再被引用。

## 0.13.25
- The container icon (`media/orca.svg`) is redrawn in a **DeepSeek-style minimal** treatment: one brand-blue fill (DeepSeek blue `#4D6BFE`), no outlines or gradients, built from a round body + an upswept thick tail with a two-lobed fluke + a backswept dorsal fin + a pectoral flipper, with the orca's eye patch left as negative space (a white patch around a blue pupil). At the 16px Activity Bar size it reads as a whale in silhouette; in the view title it reads as a blue orca.
- How it renders: VS Code masks container icons by alpha and paints them with `activityBar.inactiveForeground` (hover foreground when active), so in the Activity Bar you get the theme-coloured silhouette and the negative-space eye patch stays legible on light, dark and high-contrast themes; the same file is used for the chat view icon and the Secondary Side Bar container. The Marketplace icon (`media/icon.png`) is unchanged.
- 容器图标(`media/orca.svg`)改为 **DeepSeek 风格极简**处理:单一品牌蓝填充(DeepSeek 蓝 `#4D6BFE`)、无描边无渐变,由「浑圆身体 + 上扬粗尾与二叶尾鳍 + 后掠背鳍 + 胸鳍」构成,虎鲸眼斑作为留白(白色眼斑中一颗蓝色瞳孔)。在活动栏 16px 尺寸下读出鲸形剪影,在视图标题里则是一条蓝色虎鲸。
- 渲染原理:VS Code 会把容器图标按 alpha 取蒙版、再用 `activityBar.inactiveForeground`(激活时用 hover 前景色)着色,所以活动栏里是主题色剪影、留白眼斑在浅色/深色/高对比主题下都清晰;同一份文件同时用于聊天视图图标与辅助侧栏容器。市场展示图标(`media/icon.png`)不变。

## 0.13.24
- The VS Code container icon is now a hand-drawn **cute orca** (`media/orca.svg`) instead of the previous square logo, on both the Activity Bar container and the Secondary Side Bar container (and for the chat view's own icon). It is drawn as a black silhouette with the eye patches and mouth left as negative space, which is exactly how VS Code renders container icons - it masks the SVG by alpha and paints it with `activityBar.inactiveForeground` / the hover foreground - so the orca follows light, dark and high-contrast themes automatically at any DPI. The Marketplace extension icon (`media/icon.png`) is unchanged.
- The Cordis plugin button goes back to its 🧩 emoji as requested (the drawn puzzle icon added in 0.13.22 was removed; the Automation-tasks alarm clock and Subagent-catalog robot line icons stay).
- VS Code 容器图标从原来的方形 logo 换成手绘的**可爱风虎鲸**(`media/orca.svg`):活动栏容器、辅助侧栏容器以及聊天视图自身的图标都用它。图形以纯黑剪影 + 眼斑/嘴巴留白绘制 —— 这正是 VS Code 渲染容器图标的方式(按 alpha 蒙版,再用 `activityBar.inactiveForeground` / 悬停前景色着色),因此虎鲸会自动跟随浅色 / 深色 / 高对比主题,任意 DPI 都清晰。市场展示用的扩展图标(`media/icon.png`)保持不变。
- 按要求把 **Cordis 插件按钮恢复为 🧩 emoji**(撤销 0.13.22 里换上的手绘拼图图标);自动化任务的闹钟图标与子代理目录的机器人图标保留为线条图标。

## 0.13.23
- Every run of consecutive process rows now ends with a **summary row** like the web client's `Executed commands, read files, modified files, …`: the icon + a localized action list counted per run (`1 command`, `read 1 file · searched 2 times`, `modified 3 files`, `fetched 2 pages`, `called 1 tool`) + a chevron. Clicking it collapses or expands that run, the row itself always stays visible, and your choice survives re-renders while the turn streams (it is remembered per run on the assistant message). Runs that only contain thinking get no summary row, so there is no "no tool calls yet" noise; the counts update as each tool result lands.
- Together with 0.13.20–0.13.22 this makes one continuous run read like the web transcript: thinking row → tool row(s) → a summary line for that run, repeated down the turn, all appearing live as the events arrive (measured: tool/call and tool/result arrive in the same tick and the extension renders them immediately, never at turn end).
- 每一段连续的过程行末尾现在都有一行**汇总**(与网页端「执行了命令,已读取文件,修改了文件等」同款形态):图标 + 按段统计的本地化动作清单(`执行了 1 条命令`、`读取了 1 个文件、搜索了 2 次`、`修改了 3 个文件`、`访问了 2 个网页`、`调用了 1 个工具`)+ 折叠箭头。点击即可收起/展开这一段(汇总行自身常显),回合流式进行中重绘也会保留你的开合选择(按段记录在助手消息上);只包含思考的段不显示汇总行,不会出现「暂无工具调用」的噪声;每个工具结果落地时计数即时刷新。
- 与 0.13.20–0.13.22 一起,一条连续执行看起来就和网页端对话一致了:思考行 → 工具行 → 该段汇总行,如此往复,且全部随事件实时出现(已实测:tool/call 与 tool/result 同一节拍到达,扩展当场渲染,不存在「等回合结束才出现」)。

## 0.13.22
- The last two emoji in the header toolbar are now line icons that follow the VS Code theme like their neighbours: the **Automation tasks** button (was ⏰) uses a drawn alarm-clock icon (`ICONS.alarmClock`) and the **Subagent catalog** button (was 🤖) uses the drawn robot icon, both 15px `currentColor` strokes rendered through the same `lineIcon()` helper as the workspace / jobs / trajectory / settings buttons. Hover, active, focus-ring and the yellow running state are unchanged, and the Cordis plugin button keeps its puzzle emoji.
- 头部工具栏最后两个 emoji 改为与相邻按钮一致的线条图标:**自动化任务**(原 ⏰)换成手绘闹钟图标(`ICONS.alarmClock`),**子代理目录**(原 🤖)换用手绘机器人图标,两者都是 15px `currentColor` 描边,与工作区 / 后台任务 / 轨迹 / 设置按钮走同一个 `lineIcon()` 渲染路径。悬停、按下、焦点圈与「有子代理运行中」的黄色状态保持不变,Cordis 插件按钮保留原拼图 emoji。

## 0.13.21
- The turn activity line above the composer now names the running action instead of the generic `Running a tool…`: a tool call sets it to the localized tool row title plus its human-readable summary (`Pwsh · Write-Output hi`, `Read · src/app.ts`, `Write · lib/git.js`), and it falls back to `Thinking deeply…` / `Writing the answer…` as soon as the model streams again. The elapsed timer keeps running, so a long tool call stays identifiable even after the transcript has scrolled away.
- Also documented by measurement (no behaviour change): process rows are created **while the turn runs**, not at turn end. On a real 0.1.7-rc.2 server the `tool/call` session event arrives together with its result (+1.02s, +2.26s, …) and the session store forwards it to the webview in the same tick, where the tool node is inserted into the in-progress step group immediately; replaying a captured 8-tool turn through the real webview bundle yields 5 thinking rows, 8 tool rows and 5 prose blocks in true interleaved order, and both the current build and 0.13.17 render them.
- 输入框上方的回合活动行不再笼统显示「执行工具…」,而是直接说明当前动作:工具调用时显示本地化的工具行标题 + 人类可读摘要(`Pwsh · Write-Output hi`、`读取 · src/app.ts`、`写入 · lib/git.js`),模型恢复流式输出后回落到「深度思考中…」/「生成回答…」;计时继续走,长时间工具调用即使在对话已滚走的情况下也能一眼确认当前在做什么。
- 另以实测记录(行为未变):过程行是**回合进行中**创建并渲染的,不是回合结束才出现。真实 0.1.7-rc.2 服务器上 `tool/call` 会话事件与其结果同时到达(+1.02s、+2.26s……),会话存储在同一个事件节拍内转发给 webview,工具节点当场插入正在进行的步骤分组;把抓取到的 8 次工具调用回合喂给真实 webview 包回放,得到 5 条思考行、8 条工具行、5 段正文按真实顺序交错,当前构建与 0.13.17 均如此渲染。

## 0.13.20
- "Generate commit message" no longer fails silently: ① the collected diff is logged with its source and size (`staged changes (index vs HEAD)` / `unstaged changes (working tree vs index)` · N chars), so the DSH output channel shows exactly what the command saw; ② when there is no diff at all the message distinguishes **untracked-only** changes — `nothing to generate from — N untracked file(s) are not part of a git diff. Stage them (git add) and try again.` — from a genuinely clean tree; ③ an empty model answer now reports why (`turn end: {reason}, {events} events, {messages} assistant messages`), which separates "the host blocked the turn" from "the model returned no text". All four new strings are localized in 14 languages.
- Verified end to end with the extension's own bundled code driving a real DSH 0.1.7-rc.2 server: a staged two-file diff produced `feat: 新增 added.txt 并在 demo.txt 中追加内容` in the SCM input box, the default model stayed `deepseek-flash` + `max` afterwards, and a repo with only untracked files produced the explanatory message instead of silence.
- 「一键生成提交信息」不再静默失败:① 采集到的 diff 会连同来源与规模写入日志(`已暂存改动(index vs HEAD)` / `未暂存改动(工作区 vs index)` · N 字符),DSH 输出通道里能直接看到命令到底看到了什么;② 完全没有 diff 时会区分**只有未跟踪文件**的情况——「没有可生成的内容——有 N 个未跟踪文件不属于 git diff,请先 git add 后重试」——而不是和「工作区干净」混为一谈;③ 模型没返回文本时会说明原因(`回合结束原因:{reason},事件 N 条,助手消息 M 条`),把「宿主 block 了回合」和「模型确实没输出」分开。四条新文案已补齐 14 种语言。
- 已用扩展自身打包代码驱动真实 DSH 0.1.7-rc.2 服务器做端到端验证:两文件已暂存 diff 生成 `feat: 新增 added.txt 并在 demo.txt 中追加内容` 写入 SCM 输入框,生成后默认模型仍为 `deepseek-flash` + `max`;只有未跟踪文件的仓库则给出明确说明而不是静默。

## 0.13.19
- Fixed three defects in **Generate Commit Message** (SCM ✨ button) that made it look like the button did nothing and silently changed the model of your other conversations:
- ① **The one-shot session was archived before the prompt**, and DSH 0.1.7 ends a turn on an archived session immediately with `reason.kind = "blocked"` — the model was never called, so the command just reported "the model returned no commit message". The session is now created → prompted → archived, and hidden from the session dropdown locally while it works.
- ② `dsh.commitModel` defaulted to the literal `deepseek-v4-flash`, which does not exist on deployments that ship `deepseek-flash` / `deepseek-v4-pro`; model selection then failed with `session/model-unavailable` and aborted generation. The setting is now a **keyword** (default `flash`) matched against the catalog by id or name, with a fallback to the first model that can disable thinking, and generation proceeds with the session's current model when nothing matches.
- ③ `session/selectModel` persists the chosen model **and thinking depth** into the profile's `agent-default-model` (the default for new sessions), so picking the lightweight commit model rewrote your default — the reason a conversation started showing `low` thinking. The original default is now captured before the switch and restored on every exit path (success / cancel / timeout / error).
- Verified against a live 0.1.7-rc.2 server: an archived session really does end the turn with `blocked` while an unarchived one completes; switching the commit session to `flash` + `low` rewrites the profile, and the restore returns it to the previous value; a full generate round-trip (create → archive-free prompt → turn/end → extracted message) now returns a usable Conventional Commits line (`docs(demo): 更新 demo.txt 示例内容`).
- Also reinforced for the same 0.1.7 rule: sending a prompt to an **archived** session now auto-unarchives it first through `workspace/unarchiveSession` (silently skipped on older hosts), so continuing an archived conversation no longer ends its turn as `blocked` and drop the message.
- 修复**生成提交信息**(SCM ✨ 按钮)的三处缺陷——它既表现为「点了没反应」,又会悄悄改掉你其它对话的模型:
- ① **一次性会话在发送提示词之前就被归档**,而 DSH 0.1.7 对已归档会话的回合会立刻以 `reason.kind = "blocked"` 结束——模型一次都没被调用,命令只报「模型未返回有效提交信息」。现在顺序改为 创建 → 生成 → 归档,生成期间会话在本地隐藏,不出现在会话下拉里。
- ② `dsh.commitModel` 默认写死型号 `deepseek-v4-flash`,而交付 `deepseek-flash` / `deepseek-v4-pro` 的部署里并没有这个型号,选型直接以 `session/model-unavailable` 失败并中止生成。该设置现改为**关键字**(默认 `flash`),按 id 或名称在目录中匹配,匹配不到时回退到第一个可关闭思考的模型,完全匹配不到就用会话当前模型继续生成。
- ③ `session/selectModel` 会把所选模型**与思考深度**持久化进 profile 的 `agent-default-model`(即新建会话的默认值),因此为提交会话选轻量模型会改写你的默认选择——这就是对话里思考深度变成 `low` 的原因。现在会在切换前记录原默认值,并在所有退出路径(成功 / 取消 / 超时 / 出错)上恢复。
- 已在真实 0.1.7-rc.2 服务器上验证:归档会话的回合确实以 `blocked` 结束、未归档会话正常完成;把提交会话切到 `flash` + `low` 确实会改写 profile,恢复调用能把它改回原值;完整链路(创建 → 不归档发送 → turn/end → 提取文本)现在能返回可用的 Conventional Commits 行(`docs(demo): 更新 demo.txt 示例内容`)。
- 针对同一条 0.1.7 规则补强:向**已归档会话**发消息前会先经 `workspace/unarchiveSession` 自动取消归档(旧宿主无该端点则静默跳过),继续已归档对话不再出现回合被 `blocked` 结束、消息被丢弃的情况。

## 0.13.18
- Adapt to DSH 0.1.7-rc.2: new **Automation tasks panel** (⏰ button) listing every host-side reminder (task title, rule text, next scheduled time with countdown, enabled/ended status) with search + status filter, a per-task detail (instruction, frequency, time zone, linked session jump, last delivery) and its **delivery records** (newest-first, `Load more` paging) plus delete with inline confirmation — refreshed automatically from the host's `schedule/changed` invalidation event; the host's schedule feature is off by default since 0.1.7, and the panel explains that instead of failing.
- **Native per-message feedback**: 👍/👎 on assistant messages now write through `messageFeedback/put` (versioned CAS against the host) instead of the `/feedback` command, so clicking the active rating revokes it and ratings survive reloads (they are read back from `messageFeedback/list`); older sessions without a message id still fall back to the command.
- **0.1.7 endpoint removals handled**: `subagents/list` was removed, so the subagent catalog is now folded from the `subagentCatalog` session projection (with per-child running state) and refreshed live; the removed preset-authoring endpoints (copy / delete / open preset folder) are probed through `settings/canOpenAgentPresetDirectory` and their buttons only appear on hosts that still serve them, with a clear notice otherwise.
- **Projection baseline on session open** (`session/projections`): statistics, to-dos, permissions, context meter and the subagent catalog are read from the host right after a session opens instead of waiting for the next projection frame.
- Verified against the published 0.1.5-rc.1 and 0.1.7-rc.2 package sets: the request envelope, `remote.mux` stream set (`session/follow`, `session/control`, `workspace/follow`, `$events` + `$events/result`), host-event vocabulary, and every endpoint this extension calls except the three removals above are unchanged (one signature change: `workspaceFiles/readBytes`, unused here).
- Fixed while verifying against a live 0.1.7-rc.2 server: `session/projections` needs its single-argument payload wrapped as `{request:{…}}` (it previously failed descriptor validation and silently fell back), and a gateway 404 for a removed/disabled endpoint now surfaces as a typed `method-unavailable` error instead of a bare transport failure — the automation-tasks panel uses that to explain a host with the schedule plugin disabled instead of showing an error. 13/13 live checks pass (auth + cookie exchange, `$events` ready frame, session list/create, projection baseline, feedback list, permission catalog, schedule unavailable path, preset-authoring probe, commands/model catalog/skills, archive).
- 适配 DSH 0.1.7-rc.2:新增**自动化任务面板**(⏰ 按钮),列出宿主侧全部提醒任务(任务名 · 规则文案 · 下次计划时间与倒计时 · 已开启/已结束),支持搜索与状态筛选、任务详情(内容 · 提醒频率 · 时区 · 关联会话跳转 · 最近一次投递)与其**运行记录**(新→旧分页,「加载更多」)以及就地确认的删除;目录随宿主 `schedule/changed` 失效事件自动刷新。宿主自 0.1.7 起默认关闭定时任务,面板会明确说明而不是报错。
- **原生逐消息反馈**:助手消息的 👍/👎 改用 `messageFeedback/put`(带 version 的 CAS 写入)而非 `/feedback` 命令——再次点击当前评价即可撤销,评价在重载后依然显示(由 `messageFeedback/list` 读回);没有 message id 的旧会话仍回退到命令通道。
- **0.1.7 端点下线兜底**:`subagents/list` 已移除,子代理目录改为从 `subagentCatalog` 会话投影折叠(含每个子代理的运行态)并实时刷新;已移除的预设作者端点(复制 / 删除 / 打开预设目录)改为经 `settings/canOpenAgentPresetDirectory` 探测能力,只在仍提供这些端点的宿主上显示按钮,否则给出明确提示。
- **会话打开即读投影基线**(`session/projections`):统计、待办、权限、上下文进度环与子代理目录在会话打开后立刻从宿主读取,不再等下一个投影帧。
- 已按已发布的 0.1.5-rc.1 与 0.1.7-rc.2 包逐一核对:请求信封、`remote.mux` 流派(`session/follow` / `session/control` / `workspace/follow` / `$events` + `$events/result`)、主机事件词表,以及本扩展调用的全部端点(上述三处移除除外)均未变化;唯一签名变化 `workspaceFiles/readBytes` 本扩展未使用。
- 对真实 0.1.7-rc.2 服务器验证时修复两处:① `session/projections` 的单参数载荷必须包一层 `{request:{…}}`(此前被描述符校验拒绝并静默回退);② 端点被移除/未启用时的网关 404 现在转成带 `method-unavailable` 错误码的 `DshApiError`,而不是裸传输失败——自动化任务面板据此判断「宿主未启用定时任务」并给出说明,而不是报错。13/13 项实测通过(认证与 cookie 交换、`$events` ready 帧、会话列表/新建、投影基线、反馈列表、权限目录、定时任务不可用路径、预设作者探测、命令/模型目录/技能、归档)。

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
- Filled all missing translations using Chinese as the source: +61 keys per language in the 11 UI dictionaries (permission presets / subagent catalog / deliverables / settings namespaces & fields / tool-dir compatibility) and +5 per language in the l10n bundles (command notices / plan review header) — 726 entries total; audit confirms 0 missing across all three dictionary sets.
- 按中文为源语言补齐全部语言的缺失条目:11 种语言词典各补 61 个键(权限预设/子代理目录/产物/设置命名空间与字段/工具目录兼容等),l10n bundle 各补 5 个键(命令执行/计划审批头等),合计 726 条;审计确认三组词典全部 0 缺失。

## 0.12.67
- Bundles dsh-git-rollback@0.1.5 (identical code, version reset for the npm release flow); refreshed "model config compatibility" wording in the settings panel (EN + 12 languages).
- 内置插件升级至 dsh-git-rollback@0.1.5(内容与 0.1.4 相同,版本号用于重新对齐 npm 发布流程);设置面板「模型配置兼容」相关文案更新(英文 + 12 语言)。

## 0.12.66
- Fork-point "Restore checkpoint" divider (GitHub Copilot style): when viewing a forked conversation, a horizontal line with a centered 「还原检查点」 button now sits between the parent conversation's messages and the branch's own messages — clicking it restores the workspace to the checkpoint before this conversation began (the fork-point state), with the usual review-and-confirm dialog. The old per-message "Git rollback to before this turn" button was removed. Fallback path restores the parent's last turn-end snapshot via `/rollback <commit>` when the fork happened with a clean workspace. Includes plugin dsh-git-rollback@0.1.4 (checkpoint-SHA restore).
- 分叉点「还原检查点」分隔线(GitHub Copilot 同款):查看分叉会话时,父会话(对话 A)与该分支(对话 B)的消息之间出现一条水平分隔线,中间是「还原检查点」按钮——点击即可把工作区还原到本对话创建前的检查点(分叉时刻状态),带逐文件差异确认弹窗;同时移除了旧的「Git 回退到本回合之前」按钮。分叉时工作区干净(首快照被跳过)的兜底路径会经 `/rollback <commit>` 恢复父会话最后一轮的回合结束快照。内置插件升级至 dsh-git-rollback@0.1.4(支持按检查点提交恢复)。

## 0.12.63
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。
- On workspace-folder switch or extension activation, no session is auto-selected: the dropdown stays at " — Select session —\
- 切换工作区目录或扩展激活时不再主动选择/切换会话:下拉框保持「— 选择会话 —」占位,由用户主动选择;若当前会话不属于新目录仅取消选择(不再自动切到该目录最近会话)。

## 0.12.62
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。
- Typing / now immediately shows the main command list (plan on/off, goal, compact, feedback, permission, rollback, redo, checkpoints), with skills and .claude commands appended when a filter word is typed; switching workspace folders auto-isolates sessions — a current session outside the new folder is replaced by that folder's latest session (or none), preventing cross-folder confusion.
- 输入 / 立即弹出主要命令列表(计划模式/退出、设置目标、压缩上下文、反馈、权限、回退、重做、检查点),输入过滤词后追加技能与 .claude 命令;切换工作区目录时自动对话隔离 —— 当前会话不属于新目录则切到该目录最近会话,无会话则取消选择,避免跨目录误显运行中对话。

## 0.12.61
- Scoped turn undo (`/undo`): the checkpoints dialog and message menus now offer "Undo this turn's changes" — only the files changed by that turn are reversed (reverse-applied turn diff), your own commits and HEAD stay untouched. Cross-session checkpoint browsing lets you undo changes made by another conversation. Includes plugin dsh-git-rollback@0.1.2 (turn-end snapshots) and i18n for 13 languages.
- 回合级精确撤销(/undo):检查点清单与消息菜单新增「撤销该回合改动」——只反向应用该回合自身产生的文件改动,你自己提交的内容与 HEAD 保持不变;支持跨会话撤销别的对话产生的改动。内置插件升级至 dsh-git-rollback@0.1.2(回合结束快照),新增 13 语言界面翻译。

## 0.12.56
- Produced git-tracked files now open as HEAD → working-tree diffs by default; README intro mentions turn-level Git rollback; fixed the extension repository URL to github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code.
- 产物中的 git 已跟踪文件点击打开时,默认展示 HEAD → 工作树 diff 差异视图;插件介绍(README/简介)补充回合级 Git 回退说明;修正插件仓库地址为 github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code。
- Produced git-tracked files now open as HEAD → working-tree diffs by default; README intro mentions turn-level Git rollback; fixed the extension repository URL to github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code.
- 产物中的 git 已跟踪文件点击打开时,默认展示 HEAD → 工作树 diff 差异视图;插件介绍(README/简介)补充回合级 Git 回退说明;修正插件仓库地址为 github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code。

## 0.12.55
- New release script tools/release.mjs: automatically generates brief bilingual changelog entries on version bumps, syncing CHANGELOG.md and the extension-changelog agent.
- 新增发布脚本 tools/release.mjs:发版时自动生成中英双语更新日志条目,并同步写入 CHANGELOG.md 与 .dsh/agent/extension-changelog.md 智能体。
- New release script tools/release.mjs: automatically generates brief bilingual changelog entries on version bumps, syncing CHANGELOG.md and the extension-changelog agent.
- 新增发布脚本 tools/release.mjs:发版时自动生成中英双语更新日志条目,并同步写入 CHANGELOG.md 与 .dsh/agent/extension-changelog.md 智能体。

## 0.12.53
- 修复:回合进行中不再显示消息操作条(复制/分支/回退/点赞),避免对话被修改期间误操作。
- Fix: message action bar (copy/branch/rewind/feedback) no longer shows while a turn is still running, preventing accidental actions during edits.
- 修复:回合进行中不再显示消息操作条(复制/分支/回退/点赞),避免对话被修改期间误操作。
- Fix: message action bar (copy/branch/rewind/feedback) no longer shows while a turn is still running.

## 0.12.52
- 会话下拉默认只展示当前工作目录的对话(Claude Code 同款),可一键切换显示全部。
- The session dropdown shows only conversations in the current workspace folder by default (like Claude Code), with a one-click toggle to show all.
- 会话下拉默认只展示当前工作目录的对话(Claude Code 同款),可一键切换显示全部。
- The session dropdown shows only conversations in the current workspace folder by default.

## 0.12.51
- 智能体支持 `@` 手动调用:输入 `@` 自动弹出可用智能体列表(↑↓/Enter/Esc),发送时自动注入智能体定义;`.dsh/agent/*.md` 支持 front matter(name/description)行业约定。
- Agents support `@` mention: typing `@` shows an agent picker (↑↓/Enter/Esc); the agent definition is injected automatically when sending. `.dsh/agent/*.md` follows the industry front-matter convention (name/description).
- 智能体支持 `@` 手动调用:输入 `@` 自动弹出可用智能体列表,发送时自动注入智能体定义;`.dsh/agent/*.md` 支持 front matter 行业约定。
- Agents support `@` mention: typing `@` shows an agent picker; the agent definition is injected when sending.

## 0.12.50
- 优化审批弹窗样式与按钮(对齐网页端):色点条 + 工具徽标 + 原因 + 命令预览,「拒绝 / 允许一次」按钮风格升级。
- Redesigned the approval card and buttons (aligned with the web): status dot strip + tool badge + reason + command preview, with upgraded "Refuse / Allow once" buttons.
- 优化审批弹窗样式与按钮(对齐网页端):色点条 + 工具徽标 + 原因 + 命令预览,「拒绝 / 允许一次」按钮升级。
- Redesigned the approval card/buttons (aligned with the web): status dot strip + tool badge + reason + command preview.

## 0.12.49
- 系统提示词卡片样式重做:图标 + 标题 + 注入标签 + 折叠箭头,正文可滚动。
- Redesigned the system-prompt card: icon + title + injection tag + chevron, scrollable body.
- 系统提示词卡片样式重做:图标 + 标题 + 注入标签 + 折叠箭头,正文可滚动。
- Redesigned the system-prompt card: icon + title + injection tag + chevron, scrollable body.

## 0.12.48
- 中文预设名称「PTC 模式」更名为「编码模式」。
- Renamed the Chinese preset "PTC 模式" to "编码模式" (matches English "Code mode").
- 中文预设「PTC 模式」更名为「编码模式」。
- Renamed the Chinese preset "PTC 模式" to "编码模式".

## 0.12.47
- 移除重复的「回退到此处」菜单项(与「从此处新建分支」冲突)。
- Removed the duplicate "Rewind to here" menu item (conflicted with "Branch from here").
- 移除重复的「回退到此处」菜单项。
- Removed the duplicate "Rewind to here" menu item.

## 0.12.46
- 计划文件改为 Markdown 格式并优化命名(优先会话标题,如 `plan-xxx.md`),重启后可重新打开继续查看/修改。
- Plan files are now Markdown with readable names (session title preferred, e.g. `plan-xxx.md`); they can be reopened after restart for review/editing.
- 计划文件改为 Markdown 并优化命名(优先会话标题),重启后可重新打开。
- Plan files are now Markdown with readable names; reopenable after restart.

## 0.12.45
- 计划审批文本以纯文本等宽样式生成,并纳入产物列表;`.dsh/plans/` 持久化。
- Plan review text is generated in plain monospace style and included in the deliverables list; persisted under `.dsh/plans/`.
- 计划审批文本以纯文本等宽样式生成并纳入产物列表;`.dsh/plans/` 持久化。
- Plan review text is plain monospace, included in deliverables, persisted under `.dsh/plans/`.

## 0.12.44
- 计划审批弹窗按钮与网页端对齐(去聊天里说 / 拒绝 / 确认执行),支持审批内直接输入修改意见。
- Plan review buttons match the web (Chat about it / Refuse / Approve), with inline feedback input.
- 计划审批按钮与网页端对齐(去聊天里说 / 拒绝 / 确认执行),支持审批内输入修改意见。
- Plan review buttons match the web; inline feedback input supported.

## 0.12.43
- 提问卡片重构为网页端分页流:单选序号圆点 / 多选复选框、自定义回答输入、跳过与提交同排。
- Question cards rebuilt as the web's paged flow: numbered radio dots / checkboxes, custom answer input, skip and submit in one row.
- 提问卡片重构为网页端分页流:单选序号圆点 / 多选复选框、自定义回答、跳过与提交同排。
- Question cards rebuilt as the web's paged flow with checkboxes, custom answers, skip/submit in one row.

## 0.12.42
- 计划模式修复:`/plan` 为进入、`/plan off` 为退出;切换/新建会话时清空旧会话状态,避免计划模式误继承。
- Plan mode fix: `/plan` enters and `/plan off` exits; stale plan/goal state is cleared on session switch/new session.
- 计划模式修复:`/plan` 进入、`/plan off` 退出;切换会话清空旧状态。
- Plan mode fix: `/plan` enters, `/plan off` exits; stale state cleared on switch.

## 0.12.41
- 会话下拉升级为富文本列表:未读绿点、待审批 / 等待回答 / 运行中徽标,点击会话消除未读。
- Session dropdown upgraded to a rich list: unread dots, pending-approval / awaiting-answer / running badges; selecting a session clears its unread mark.
- 会话下拉升级为富文本列表:未读绿点、待审批 / 等待回答 / 运行中徽标。
- Session dropdown upgraded: unread dots, pending/running badges.

## 0.12.40
- 新增 `.dsh` 项目目录约定:`.dsh/agent`(智能体)、`.dsh/skills`(技能)、`.dsh/memory`(记忆)扫描与 `/` 菜单展示。
- Added `.dsh` project conventions: scanning of `.dsh/agent` (agents), `.dsh/skills` (skills), `.dsh/memory` (memory) surfaced in the `/` menu.
- 新增 `.dsh` 项目目录约定:`.dsh/agent`(智能体)、`.dsh/skills`(技能)、`.dsh/memory`(记忆)扫描与 `/` 菜单展示。
- Added `.dsh` project conventions: agents/skills/memory scanned and shown in the `/` menu.

## 0.12.17
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
- 对话渲染对齐网页端:思考自动展开/收起;工具调用内联在思考块之后;产物卡 ProducedFiles 同款。
- Conversation rendering matches the web: reasoning expand/collapse, inline tool calls, ProducedFiles-style deliverables.
- 内置 Agent 预设多语言化;统计行固定输入框底部;思考选择器移至右上角;⏳ 旋转运行指示;14 种语言。
- Localized presets, pinned stats bar, top-right thinking selector, spinning ⏳ running indicator, 14 languages.

## 0.12.75
- Fix 'Steer now' on queued messages: ① the steer button is now only enabled while the agent is running (web parity; disabled with an explanatory tooltip after the turn ends/cancel/error); ② clear feedback on accepted steers (handled right after the current response) and actionable notice when the turn no longer accepts steering; silent convergence when the item was already claimed; ③ fix the running indicator wrongly clearing when queued messages remain after a turn; ④ add the missing Arabic package.nls key and remove its BOM.
- 修复排队消息「插队」失效问题:① 插队按钮仅在 agent 运行中可用(与网页端 disabled:!running 一致,回合已结束/取消/出错后禁用并给出提示);② 插队成功给出明确反馈(将在当前回答结束后优先处理),回合结束不可插队时给出可操作提示,消息已被开始处理时静默收敛;③ 修正回合结束但仍有排队消息时运行状态误判为停止的问题;④ 补齐阿拉伯语 package.nls 缺失键并移除 BOM。

## 0.12.73
- Added Russian (ru) support: 446 UI dictionary entries + 160 host l10n strings + 53 contribution-point strings fully translated; the settings language picker, dsh.language enum, and README language list now include Русский.
- 新增俄语(ru)支持:446 条界面词典 + 160 条宿主 l10n + 53 条贡献点文案全部译毕;设置面板语言选择器、dsh.language 枚举、README 语言清单同步加入 Русский。

## 0.12.65
- Archiving a session no longer activates sessions from other workspace folders: the next session is picked only within the current folder (or the dropdown returns to " — Select session —\);
- 归档会话后不再激活其他工作目录的会话:仅从当前工作目录内选择下一个会话,目录内无会话则回到「— 选择会话 —」;目录过滤开启时下拉列表严格只显示当前目录的会话(不再特殊保留其他目录的当前会话)。

## 0.12.64
- Commit-message generation no longer activates a session in the conversation list: the one-shot session is archived immediately and the user's previous current session is restored — generation runs fully in the background (progress in a notification), never disturbing the session dropdown.
- 生成 git 提交信息时不再激活到对话列表:一次性会话创建后立即归档,并恢复用户原当前会话 —— 生成全程在后台进行(进度走通知气泡),不打断、不污染会话下拉列表。

## 0.12.60
- Local skills (.claude/.codex) now behave like all skills: picking inserts a /name token (expanded on send, no full-text dump into the input); typing / auto-completes commands and skills (plan mode, skills, .claude commands; ↑↓/Enter/Esc).
- .claude / .codex 等本地技能与所有技能统一:点击插入 /名称 token(发送时由扩展展开正文,不再整文塞入输入框);输入 / 时自动弹出命令与技能补全(计划模式、技能、.claude 命令等,↑↓/Enter/Esc 选择)。

## 0.12.59
- Answered why global skills still appear with only .claude enabled: the available-skills list now shows source tags and a new " DSH user skills\
- 回答「只启用 .claude 仍显示全局技能」:可用技能列表新增来源标注(全局/内置等)与「DSH 用户技能」开关 —— 关闭后 ~/.dsh/skills、~/.agents/skills 与自定义目录的技能不再显示。

## 0.12.58
- Rollback-review diffs now render git-style with line numbers (added=green, removed=red, header/hunk highlights); the agent-config-dirs toggles now govern both project and user-global config dirs (e.g. disabling codex skips ~/.codex and the project .codex).
- 回退审核的「查看差异」改为 git 风格:带行号,新增行标绿、删除行标红,文件头/hunk 头高亮;智能体配置目录开关现在同时控制项目目录与用户全局目录(如禁用 codex 后 ~/.codex 与项目 .codex 都不再读取展示)。
