/**
 * 0.13.42 样式改造:待处理卡片(计划待审 / 提问 / 审批)+ 按钮统一走 VS Code 主题。
 * 用 Node 做精确字符串替换并逐条断言(避免 PowerShell 文本管道的编码问题)。
 * 幂等:任一锚点缺失即报错退出,不会写出半成品。
 */
const fs = require("node:fs");

const path = "media/chat.css";
let css = fs.readFileSync(path, "utf8");
// 统一成 LF 做替换,写回时恢复原换行风格(仓库检出可能是 CRLF)
const eol = css.includes("\r\n") ? "\r\n" : "\n";
css = css.split("\r\n").join("\n");
const applied = [];

function replace(name, from, to) {
  const hits = css.split(from).length - 1;
  if (hits !== 1) {
    console.error(`[FAIL] ${name}: expected 1 match, found ${hits}`);
    process.exit(1);
  }
  css = css.split(from).join(to);
  applied.push(name);
}

// ---------- 1. 语义色变量 ----------
replace(
  "vars",
  `  --dsh-code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
`,
  `  --dsh-code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
  /* ---- 卡片 / 按钮的语义色(一律映射 VS Code 主题变量,不写死颜色) ----
     待处理卡片(计划待审 / 提问 / 审批)统一用「面板底色 + 细边框 + 左侧分类导轨」,
     不再整块染色:暗色主题下大片彩色底会让正文对比度下降,也与 VS Code 的通知卡不一致。 */
  --dsh-surface: var(--vscode-editorWidget-background, #252526);
  --dsh-surface-soft: var(--vscode-sideBarSectionHeader-background, rgba(128, 128, 128, 0.08));
  --dsh-surface-border: var(--vscode-panel-border, #3c3c3c);
  --dsh-btn2-bg: var(--vscode-button-secondaryBackground, #3a3d41);
  --dsh-btn2-fg: var(--vscode-button-secondaryForeground, #ffffff);
  --dsh-btn2-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
  --dsh-danger: var(--vscode-errorForeground, #f14c4c);
  --dsh-danger-bg: var(--vscode-inputValidation-errorBackground, rgba(241, 76, 76, 0.14));
  --dsh-danger-border: var(--vscode-inputValidation-errorBorder, #be1100);
  --dsh-warn: var(--vscode-charts-orange, #d18616);
  --dsh-info: var(--vscode-charts-blue, #3794ff);
  --dsh-plan: var(--vscode-charts-purple, #b180d7);
`,
);

// ---------- 2. 通用按钮 ----------
replace(
  "button-base",
  `.btn {
  background: var(--dsh-btn-bg);
  color: var(--dsh-btn-fg);
  border: none;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn:hover {
  filter: brightness(1.1);
}`,
  `.btn {
  background: var(--dsh-btn2-bg);
  color: var(--dsh-btn2-fg);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.btn:hover {
  background: var(--dsh-btn2-hover);
  filter: none;
}

.btn:focus-visible {
  outline: 1px solid var(--dsh-accent);
  outline-offset: 1px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}`,
);

// ---------- 3. 待处理区与卡片公共外观 ----------
replace(
  "pending-area",
  `.pending-area {
  flex-shrink: 0;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 55%;
  overflow-y: auto;
}

.pending-card {
  border: 1px solid #dcdcaa;
  background: rgba(220, 220, 170, 0.06);
  border-radius: 10px;
  padding: 8px 10px;
}`,
  `.pending-area {
  flex-shrink: 0;
  padding: 2px 12px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 55%;
  overflow-y: auto;
}

/*
 * 待处理卡片(计划待审 / 提问 / 工具审批 / 插件审批)的公共外观:
 * VS Code 面板式表面 + 1px 主题边框 + 3px 左侧分类导轨。
 * 分类只体现在导轨与头部图标的颜色上,正文保持主题前景色,长文本更易读。
 */
.pending-card {
  border: 1px solid var(--dsh-surface-border);
  border-left: 3px solid var(--dsh-surface-border);
  background: var(--dsh-surface);
  border-radius: 8px;
  padding: 10px 12px;
}`,
);

// ---------- 4. 会话行徽标配色 ----------
replace(
  "badges",
  `.badge-approval {
  color: #f48771;
  background: rgba(244, 135, 113, 0.1);
  border-color: rgba(244, 135, 113, 0.45);
}

.badge-plan {
  color: #dcdcaa;
  background: rgba(220, 220, 170, 0.1);
  border-color: rgba(220, 220, 170, 0.45);
}

.badge-question {
  color: #6cb8ff;
  background: rgba(0, 127, 212, 0.1);
  border-color: rgba(0, 127, 212, 0.45);
}`,
  `/* 会话行徽标:类别色一律取主题语义色,亮色主题下也可读(旧的写死色在白底上会发灰) */
.badge-approval {
  color: var(--dsh-danger);
  background: var(--dsh-danger-bg);
  border-color: var(--dsh-danger-border);
}

.badge-plan {
  color: var(--dsh-plan);
  background: var(--dsh-surface-soft);
  border-color: var(--dsh-plan);
}

.badge-question {
  color: var(--dsh-info);
  background: var(--dsh-surface-soft);
  border-color: var(--dsh-info);
}`,
);

// ---------- 5. 状态点 ----------
replace(
  "status-dots",
  `.status-dot.ok {
  background: #4ec9b0;
}

.status-dot.starting {
  background: #dcdcaa;
}

.status-dot.err {
  background: #f48771;
  cursor: pointer;
}`,
  `.status-dot.ok {
  background: var(--vscode-charts-green, #89d185);
}

.status-dot.starting {
  background: var(--dsh-warn);
}

.status-dot.err {
  background: var(--dsh-danger);
  cursor: pointer;
}`,
);

// ---------- 6. 会话行小圆点 / 未读点 / 目标进度条 ----------
replace(
  "session-dots",
  `.session-btn-dot.dot-warn {
  background: #f48771;
}`,
  `.session-btn-dot.dot-warn {
  background: var(--dsh-danger);
}`,
);
replace(
  "session-dots-unread",
  `.session-btn-dot.dot-unread {
  background: #4ec9b0;
}`,
  `.session-btn-dot.dot-unread {
  background: var(--vscode-charts-green, #89d185);
}`,
);
replace(
  "unread-dot",
  `  border-radius: 50%;
  background: #4ec9b0;
  flex: none;`,
  `  border-radius: 50%;
  background: var(--vscode-charts-green, #89d185);
  flex: none;`,
);
replace(
  "goal-bar",
  `.goal-bar-fill.complete {
  background: #4ec9b0;
}`,
  `.goal-bar-fill.complete {
  background: var(--vscode-charts-green, #89d185);
}`,
);

// ---------- 7. 提问卡片 ----------
replace(
  "question-card",
  `.question-card {
  border-color: var(--dsh-accent);
  background: rgba(0, 127, 212, 0.05);
  padding: 0;
  overflow: hidden;
}

.question-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 7px;
  border-bottom: 1px solid var(--dsh-border);
  color: var(--dsh-accent);
}

.question-head-title {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--dsh-fg);
}`,
  `.question-card {
  border-left-color: var(--dsh-info);
  padding: 0;
  overflow: hidden;
}

.question-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 8px;
  border-bottom: 1px solid var(--dsh-surface-border);
  background: var(--dsh-surface-soft);
  color: var(--dsh-info);
}

.question-head-title {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0;
  color: var(--dsh-fg);
}`,
);

replace(
  "countdown",
  `.question-countdown {
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--dsh-accent);
  color: var(--dsh-accent);
  font-variant-numeric: tabular-nums;
}

.question-countdown-expired {
  border-color: var(--dsh-border);
  color: var(--dsh-muted);
}`,
  `.question-countdown {
  flex: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsh-surface-border);
  background: var(--dsh-surface);
  color: var(--dsh-muted);
  font-variant-numeric: tabular-nums;
}

.question-countdown-expired {
  border-color: var(--dsh-surface-border);
  color: var(--dsh-muted);
  opacity: 0.85;
}`,
);

replace(
  "question-minimized",
  `.question-card.question-minimized {
  background: rgba(0, 127, 212, 0.03);
}

.question-card.question-minimized .question-head {
  border-bottom: none;
  padding-bottom: 8px;
}`,
  `.question-card.question-minimized {
  background: var(--dsh-surface);
}

.question-card.question-minimized .question-head {
  border-bottom: none;
  padding-bottom: 9px;
}`,
);

replace(
  "question-body-footer",
  `.question-body {
  padding: 8px 10px 10px;
  max-height: 46vh;
  overflow-y: auto;
}

.question-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 12.5px;
  line-height: 1.5;
}

.question-detail {
  font-size: 11.5px;
  color: var(--dsh-muted);
  margin: 4px 0 2px;
  white-space: pre-wrap;
  line-height: 1.5;
}

.question-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--dsh-border);
  padding: 6px 10px 8px;
}`,
  `.question-body {
  padding: 10px 12px 12px;
  max-height: 46vh;
  overflow-y: auto;
}

.question-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 12.5px;
  line-height: 1.55;
}

.question-detail {
  font-size: 11.5px;
  color: var(--dsh-muted);
  margin: 6px 0 2px;
  white-space: pre-wrap;
  line-height: 1.55;
}

.question-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--dsh-surface-border);
  padding: 8px 12px;
}`,
);

replace(
  "question-feedback",
  `.question-feedback {
  flex-basis: 100%;
  order: 10;
  font-size: 11px;
  color: #f48771;
}`,
  `.question-feedback {
  flex-basis: 100%;
  order: 10;
  font-size: 11px;
  color: var(--dsh-danger);
}`,
);

replace(
  "option-checked",
  `.option-row:has(input:checked) {
  border-color: var(--dsh-accent);
  background: rgba(0, 127, 212, 0.09);
}`,
  `.option-row:has(input:checked) {
  border-color: var(--dsh-accent);
  background: var(--vscode-list-activeSelectionBackground, rgba(0, 127, 212, 0.12));
}`,
);

replace(
  "option-mark",
  `.option-row:has(input:checked) .option-mark {
  background: var(--dsh-accent);
  border-color: var(--dsh-accent);
  color: #fff;
}`,
  `.option-row:has(input:checked) .option-mark {
  background: var(--dsh-accent);
  border-color: var(--dsh-accent);
  color: var(--vscode-button-foreground, #fff);
}`,
);

// ---------- 8. 计划待审卡片 ----------
replace(
  "plan-card",
  `.plan-card {
  border-color: #dcdcaa;
  background: rgba(220, 220, 170, 0.06);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 52vh;
}

.plan-card .question-head {
  border-color: #dcdcaa;
  color: #dcdcaa;
  flex-shrink: 0;
}

.plan-detail-box {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--dsh-border);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 10px;
  font-size: 12px;
  line-height: 1.55;
  background: var(--dsh-code-bg);
}

.plan-card .question-footer-actions {
  margin: 0 10px 10px;
  flex-shrink: 0;
  justify-content: flex-end;
}

.plan-card .plan-custom-row {
  margin: 0 10px 6px;
  flex-shrink: 0;
}`,
  `/*
 * 计划待审卡片:与提问卡同一套表面,导轨换成主题紫(网页端 plan 语义色)。
 * 头部不再整行染色,只让图标带颜色;正文放进独立的滚动区,长计划可读可滚。
 */
.plan-card {
  border-left-color: var(--dsh-plan);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 52vh;
}

.plan-card .question-head {
  border-color: var(--dsh-surface-border);
  color: var(--dsh-plan);
  flex-shrink: 0;
}

.plan-detail-box {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--dsh-surface-border);
  border-radius: 6px;
  padding: 12px 14px;
  margin: 10px 12px;
  font-size: 12.5px;
  line-height: 1.65;
  background: var(--vscode-editor-background, var(--dsh-code-bg));
  color: var(--dsh-fg);
}

.plan-detail-box > :first-child {
  margin-top: 0;
}

.plan-detail-box > :last-child {
  margin-bottom: 0;
}

.plan-detail-box h1 {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  margin: 0 0 8px;
}

.plan-detail-box h2,
.plan-detail-box h3 {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
  margin: 14px 0 6px;
  color: var(--dsh-fg);
}

.plan-detail-box h2:first-child,
.plan-detail-box h3:first-child {
  margin-top: 0;
}

.plan-detail-box ul,
.plan-detail-box ol {
  margin: 6px 0;
  padding-left: 20px;
}

.plan-detail-box li {
  margin: 3px 0;
}

.plan-detail-box code {
  background: var(--dsh-code-bg);
  border-radius: 4px;
  padding: 1px 4px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11.5px;
}

.plan-card .question-footer-actions {
  margin: 0 12px 10px;
  flex-shrink: 0;
  justify-content: flex-end;
}

.plan-card .plan-custom-row {
  margin: 0 12px 8px;
  flex-shrink: 0;
}`,
);

// ---------- 9. 按钮主次 ----------
replace(
  "skip-btn-and-buttons",
  `.skip-btn {
  background: transparent;
  border: 1px solid var(--dsh-border);
  color: var(--dsh-muted);
}

.skip-btn:hover {
  border-color: var(--dsh-muted);
  color: var(--dsh-fg);
}

.pending-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
}

.btn-allow {
  background: #2ea043;
  color: #fff;
  border: 1px solid transparent;
}

.btn-allow:hover {
  background: #3fb950;
  filter: none;
}

.btn-reject {
  background: transparent;
  color: #f48771;
  border: 1px solid #f48771;
}

.btn-reject:hover {
  background: rgba(244, 135, 113, 0.12);
  color: #f48771;
  filter: none;
}`,
  `.skip-btn {
  background: transparent;
  border: 1px solid var(--dsh-surface-border);
  color: var(--dsh-muted);
}

.skip-btn:hover {
  background: var(--dsh-btn2-bg);
  border-color: var(--dsh-surface-border);
  color: var(--dsh-fg);
}

.pending-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 12.5px;
  margin-bottom: 6px;
}

/* 主操作:走主题主按钮色(界面里唯一的强调色块) */
.btn-allow {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
  border: 1px solid transparent;
}

.btn-allow:hover {
  background: var(--vscode-button-hoverBackground, #1177bb);
  filter: none;
}

/* 次要 / 否决操作:默认与普通次要按钮一致,悬停才透出风险色,避免整块红框的压力感 */
.btn-reject {
  background: transparent;
  color: var(--dsh-fg);
  border: 1px solid var(--dsh-surface-border);
}

.btn-reject:hover {
  background: var(--dsh-danger-bg);
  border-color: var(--dsh-danger-border);
  color: var(--dsh-danger);
  filter: none;
}`,
);

// ---------- 10. 审批卡片 ----------
replace(
  "approval-card",
  `.approval-card {
  border-color: rgba(244, 135, 113, 0.55);
  background: rgba(244, 135, 113, 0.05);
  padding: 0;
  overflow: hidden;
}

/* Cordis 插件审批卡(网页端 Cordis 浮窗面板同款:紫色点缀区分工具审批) */
.cordis-approval-card {
  border-color: rgba(139, 122, 214, 0.55);
  background: rgba(139, 122, 214, 0.06);
}

.cordis-approval-card .cordis-dot {
  background: #8b7ad6;
}`,
  `.approval-card {
  border-left-color: var(--dsh-warn);
  padding: 0;
  overflow: hidden;
}

/* Cordis 插件审批卡(网页端 Cordis 浮窗面板同款:紫色导轨区分工具审批) */
.cordis-approval-card {
  border-left-color: var(--dsh-plan);
}

.cordis-approval-card .cordis-dot {
  background: var(--dsh-plan);
}`,
);

replace(
  "btn-allow-plugin",
  `.btn-allow-plugin {
  border-color: rgba(139, 122, 214, 0.6);
}`,
  `/* 次要的「允许后续版本」:保留一点插件紫的描边以区别于普通次要按钮,但不抢主操作 */
.btn-allow-plugin {
  background: transparent;
  color: var(--dsh-fg);
  border: 1px solid var(--dsh-plan);
}

.btn-allow-plugin:hover {
  background: var(--dsh-surface-soft);
  border-color: var(--dsh-plan);
  color: var(--dsh-fg);
  filter: none;
}`,
);

replace(
  "approval-head",
  `.approval-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 7px;
  border-bottom: 1px solid var(--dsh-border);
}

.approval-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e9950c;`,
  `.approval-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 8px;
  border-bottom: 1px solid var(--dsh-surface-border);
  background: var(--dsh-surface-soft);
}

.approval-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsh-warn);`,
);

replace(
  "approval-body",
  `.approval-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  max-height: 30vh;
  overflow-y: auto;
}`,
  `.approval-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  max-height: 30vh;
  overflow-y: auto;
}`,
);

replace(
  "approval-tool",
  `.approval-tool {
  align-self: flex-start;
  font-size: 10.5px;
  border-radius: 999px;
  padding: 2px 9px;
  background: rgba(244, 135, 113, 0.12);
  color: #f48771;
  border: 1px solid rgba(244, 135, 113, 0.4);
  white-space: nowrap;
}

.approval-headline {
  font-size: 12.5px;
  line-height: 1.5;
  overflow-wrap: break-word;
}

.approval-command {
  margin: 0;
  font-size: 11.5px;
  background: var(--dsh-code-bg);
  border: 1px solid var(--dsh-border);
  border-radius: 6px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-all;
  opacity: 0.9;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 10px 10px;
}`,
  `.approval-tool {
  align-self: flex-start;
  font-size: 10.5px;
  border-radius: 999px;
  padding: 2px 9px;
  background: var(--dsh-surface-soft);
  color: var(--dsh-fg);
  border: 1px solid var(--dsh-surface-border);
  font-family: var(--vscode-editor-font-family, monospace);
  white-space: nowrap;
}

.approval-headline {
  font-size: 12.5px;
  line-height: 1.55;
  overflow-wrap: break-word;
}

.approval-command {
  margin: 0;
  font-size: 11.5px;
  background: var(--vscode-editor-background, var(--dsh-code-bg));
  border: 1px solid var(--dsh-surface-border);
  border-radius: 6px;
  padding: 7px 9px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--vscode-editor-font-family, monospace);
  line-height: 1.5;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 12px 10px;
}`,
);

// ---------- 11. 计划 / 目标 / 运行中芯片 ----------
replace(
  "plan-chip",
  `.plan-chip {
  border-color: #dcdcaa;
  background: rgba(220, 220, 170, 0.12);
  color: #dcdcaa;
}

.goal-chip {
  border-color: var(--dsh-accent);
  background: rgba(0, 127, 212, 0.12);
  color: #6cb8ff;
}

.goal-chip.done {
  border-color: #4ec9b0;
  background: rgba(78, 201, 176, 0.1);
  color: #4ec9b0;
}

.goal-chip.blocked {
  border-color: #f48771;
  background: rgba(244, 135, 113, 0.1);
  color: #f48771;
}

.goal-chip.paused {
  border-color: #dcdcaa;
  background: rgba(220, 220, 170, 0.1);
  color: #dcdcaa;
}`,
  `.plan-chip {
  border-color: var(--dsh-plan);
  background: var(--dsh-surface-soft);
  color: var(--dsh-plan);
}

.goal-chip {
  border-color: var(--dsh-accent);
  background: var(--vscode-list-activeSelectionBackground, rgba(0, 127, 212, 0.12));
  color: var(--dsh-info);
}

.goal-chip.done {
  border-color: var(--vscode-charts-green, #89d185);
  background: var(--dsh-surface-soft);
  color: var(--vscode-charts-green, #89d185);
}

.goal-chip.blocked {
  border-color: var(--dsh-danger);
  background: var(--dsh-danger-bg);
  color: var(--dsh-danger);
}

.goal-chip.paused {
  border-color: var(--dsh-warn);
  background: var(--dsh-surface-soft);
  color: var(--dsh-warn);
}`,
);

replace(
  "running-chip",
  `.running-chip {
  border-color: #dcdcaa;
  color: #dcdcaa;
}`,
  `.running-chip {
  border-color: var(--dsh-warn);
  color: var(--dsh-warn);
}`,
);

// 自动附加的激活文件芯片
replace(
  "attachment-auto-chip",
  `.attachment-chip.auto {
  border-color: var(--dsh-accent);
  color: #6cb8ff;
}`,
  `.attachment-chip.auto {
  border-color: var(--dsh-accent);
  color: var(--dsh-info);
}`,
);

// ---------- 12. 通用对话框 ----------
replace(
  "dialog",
  `.dialog-box {
  width: min(340px, 100%);
  background: var(--vscode-editorWidget-background, #252526);
  border: 1px solid var(--dsh-border);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.dialog-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.dialog-text {
  font-size: 12px;
  color: var(--dsh-muted);
  margin-bottom: 10px;
  line-height: 1.5;
}`,
  `.dialog-box {
  width: min(360px, 100%);
  background: var(--vscode-editorWidget-background, #252526);
  border: 1px solid var(--dsh-surface-border);
  border-radius: 10px;
  padding: 16px 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.dialog-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.dialog-text {
  font-size: 12.5px;
  color: var(--dsh-muted);
  margin-bottom: 12px;
  line-height: 1.55;
}`,
);

replace(
  "dialog-buttons",
  `.dialog-cancel {
  background: transparent;
  border: 1px solid var(--dsh-border);
  color: var(--dsh-fg);
}

.dialog-confirm {
  background: var(--dsh-btn-bg);
}`,
  `/*
 * 注意选择器要带 .btn:通用 .btn 规则在文件更靠后的位置(同特异性、后写者胜),
 * 只写 .dialog-confirm 会被 .btn 的次要按钮底色覆盖 —— 之前对话框的「确定」一直是灰的。
 */
.btn.dialog-cancel {
  background: transparent;
  border: 1px solid var(--dsh-surface-border);
  color: var(--dsh-fg);
}

.btn.dialog-cancel:hover {
  background: var(--dsh-btn2-bg);
  filter: none;
}

.btn.dialog-confirm {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
}

.btn.dialog-confirm:hover {
  background: var(--vscode-button-hoverBackground, #1177bb);
  filter: none;
}

/* 「清除」等第三类动作:与次要按钮同形,但用危险色文字提示破坏性 */
.btn.dialog-confirm2 {
  background: transparent;
  border: 1px solid var(--dsh-surface-border);
  color: var(--dsh-danger);
}

.btn.dialog-confirm2:hover {
  background: var(--dsh-danger-bg);
  border-color: var(--dsh-danger-border);
  filter: none;
}`,
);

// 保底:不许再有旧的绿色 / 黄绿 / 紫色硬编码残留在样式里
for (const [name, token] of [
  ["#2ea043 (green)", "#2ea043"],
  ["#3fb950 (green)", "#3fb950"],
  ["#dcdcaa (yellow-green)", "#dcdcaa"],
  ["#8b7ad6 (purple)", "#8b7ad6"],
]) {
  const left = css.split(token).length - 1;
  if (left !== 0) {
    console.error(`[FAIL] leftover hard-coded color ${name} × ${left}`);
    process.exit(1);
  }
}

fs.writeFileSync(path, eol === "\r\n" ? css.split("\n").join("\r\n") : css, "utf8");
console.log(`applied ${applied.length} blocks: ${applied.join(", ")}`);
