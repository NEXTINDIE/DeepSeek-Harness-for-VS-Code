/**
 * dsh-git-rollback 的网页端 client 半(正式插件,随 VS Code 扩展分发)。
 *
 * 在 DSH Web GUI 的对话流中渲染「还原检查点」分隔线(每个已完成回合尾部),
 * 点击后弹出悬浮确认弹窗(与 VS Code 审核窗口一致的语义):
 *   - 预览:fetch 同源 /dsh-rollback/preview → 该回合自身改动(回合开始→结束 diff)
 *   - 确认:fetch 同源 /dsh-rollback/apply → 执行服务端 /undo N
 *     (只撤销该回合自身的文件改动,你自己的提交与 HEAD 不受影响)
 *
 * 零 DSH 模块依赖:仅 require("react")(shell 静态模块);slots 经 ctx.get 动态获取。
 * 打包:tools/bundle-client.mjs(esbuild → window.__ModuleLoader__.load 格式)。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const React = require("react");

let styleEl: HTMLStyleElement | null = null;

function ensureCss(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent =
    ".dsh-rb-divider{display:flex;align-items:center;justify-content:center;margin:10px 0;position:relative}" +
    ".dsh-rb-divider::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:var(--dsw-alias-border-l1)}" +
    ".dsh-rb-btn{position:relative;z-index:1;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;padding:4px 16px;cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s}" +
    ".dsh-rb-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}" +
    ".dsh-rb-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999}" +
    ".dsh-rb-dialog{min-width:380px;max-width:600px;max-height:70vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 40px rgba(0,0,0,.4);padding:16px 18px;font-size:13px;color:var(--dsw-alias-label-primary);line-height:1.5}" +
    ".dsh-rb-dialog-title{font-weight:600;font-size:13.5px;margin-bottom:4px}" +
    ".dsh-rb-dialog-sub{margin-bottom:10px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}" +
    ".dsh-rb-files{max-height:220px;overflow-y:auto;margin:4px 0 8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}" +
    ".dsh-rb-file{display:flex;align-items:baseline;gap:8px;padding:2px 0}" +
    ".dsh-rb-file-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".dsh-rb-file-add{color:var(--dsw-alias-state-success-primary)}.dsh-rb-file-del{color:var(--dsw-alias-state-error-primary)}" +
    ".dsh-rb-empty{color:var(--dsw-alias-label-secondary);font-size:11.5px}" +
    ".dsh-rb-stats{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}" +
    ".dsh-rb-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}" +
    ".dsh-rb-confirm{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-radius:7px;padding:6px 20px;font-size:12.5px;font-weight:600;cursor:pointer}" +
    ".dsh-rb-confirm:hover{filter:brightness(1.1)}" +
    ".dsh-rb-cancel{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:6px 18px;font-size:12.5px;cursor:pointer}" +
    ".dsh-rb-cancel:hover{background:var(--dsw-alias-bg-layer-1)}" +
    ".dsh-rb-result{margin-top:8px;font-size:11.5px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary)}";
  document.head.appendChild(styleEl);
}

function removeCss(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

interface PreviewFile {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

interface UndoPreview {
  turn: number;
  time: number;
  files: PreviewFile[];
  addedTotal: number;
  deletedTotal: number;
}

/** 同源调用 host 路由。 */
async function callApi<T>(path: string, body: { sessionId: string; turn: number }): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await res.json()) as T;
  return value;
}

type DialogPhase =
  | { phase: "closed" }
  | { phase: "idle"; sessionId: string; turn: number }
  | { phase: "loading"; sessionId: string; turn: number }
  | { phase: "confirm"; sessionId: string; turn: number; preview: UndoPreview }
  | { phase: "applying"; sessionId: string; turn: number }
  | { phase: "done"; sessionId: string; turn: number; ok: boolean; message: string }
  | { phase: "error"; sessionId: string; turn: number; message: string };

// 分隔线按钮 ↔ 悬浮弹窗 的共享状态(插件生命周期内有效)
let dialog: { sessionId: string; turn: number } | null = null;
const dialogListeners = new Set<() => void>();

function openDialog(sessionId: string, turn: number): void {
  dialog = { sessionId, turn };
  for (const fn of dialogListeners) fn();
}

function closeDialog(): void {
  dialog = null;
  for (const fn of dialogListeners) fn();
}

function subscribeDialog(fn: () => void): () => void {
  dialogListeners.add(fn);
  return () => {
    dialogListeners.delete(fn);
  };
}

/** 文件行(+N 绿 / −M 红,与 VS Code 审核窗口一致)。 */
function fileRow(f: PreviewFile): React.ReactNode {
  const badge = f.binary
    ? React.createElement("span", { className: "dsh-rb-empty", key: "b" }, "二进制")
    : [
        f.added > 0 ? React.createElement("span", { className: "dsh-rb-file-add", key: "a" }, `+${f.added}`) : null,
        f.deleted > 0 ? React.createElement("span", { className: "dsh-rb-file-del", key: "d" }, `−${f.deleted}`) : null,
      ];
  return React.createElement(
    "div",
    { className: "dsh-rb-file", key: f.path },
    React.createElement("span", { className: "dsh-rb-file-path", title: f.path }, f.path),
    badge,
  );
}

/** 悬浮确认弹窗(shell.overlay)。 */
function RestoreDialog(): React.ReactNode {
  const [state, setState] = React.useState<DialogPhase>({ phase: "closed" });

  React.useEffect(() => {
    ensureCss();
    const unsub = subscribeDialog(() => {
      const d = dialog;
      if (d) setState({ phase: "idle", sessionId: d.sessionId, turn: d.turn });
      else setState({ phase: "closed" });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (state.phase === "closed") return null;
  const { sessionId, turn } = state;

  const openPreview = async (): Promise<void> => {
    setState({ phase: "loading", sessionId, turn });
    try {
      const preview = await callApi<UndoPreview & { error?: string }>("/dsh-rollback/preview", { sessionId, turn });
      if (preview && preview.error) setState({ phase: "error", sessionId, turn, message: String(preview.error) });
      else if (preview) setState({ phase: "confirm", sessionId, turn, preview });
      else setState({ phase: "error", sessionId, turn, message: "预览失败" });
    } catch (err) {
      setState({ phase: "error", sessionId, turn, message: String(err instanceof Error ? err.message : err) });
    }
  };

  const applyUndo = async (): Promise<void> => {
    setState({ phase: "applying", sessionId, turn });
    try {
      const result = await callApi<{ ok?: boolean; text?: string; error?: string }>("/dsh-rollback/apply", { sessionId, turn });
      setState({
        phase: "done",
        sessionId,
        turn,
        ok: !!(result && result.ok),
        message: result && result.text ? String(result.text) : result && result.error ? String(result.error) : "已执行",
      });
    } catch (err) {
      setState({ phase: "error", sessionId, turn, message: String(err instanceof Error ? err.message : err) });
    }
  };

  let body: React.ReactNode;
  switch (state.phase) {
    case "idle":
    case "loading":
      body = React.createElement(
        "div",
        null,
        React.createElement("div", { className: "dsh-rb-dialog-title" }, "还原检查点"),
        React.createElement(
          "div",
          { className: "dsh-rb-dialog-sub" },
          `回合 ${turn} — 将撤销该回合产生的以下改动(你的提交与 HEAD 不受影响):`,
        ),
        state.phase === "loading"
          ? React.createElement("div", { className: "dsh-rb-empty" }, "计算差异…")
          : React.createElement(
              "div",
              { className: "dsh-rb-actions" },
              React.createElement("button", { className: "dsh-rb-cancel", onClick: closeDialog }, "取消"),
              React.createElement("button", { className: "dsh-rb-confirm", onClick: () => void openPreview() }, "查看改动"),
            ),
      );
      break;
    case "confirm": {
      const p = state.preview;
      const rows =
        p.files && p.files.length > 0
          ? p.files.map(fileRow)
          : [React.createElement("div", { className: "dsh-rb-empty", key: "e" }, "该回合没有文件改动")];
      body = React.createElement(
        "div",
        null,
        React.createElement("div", { className: "dsh-rb-dialog-title" }, "还原检查点"),
        React.createElement(
          "div",
          { className: "dsh-rb-dialog-sub" },
          `回合 ${turn} — 将撤销该回合产生的以下改动(你的提交与 HEAD 不受影响):`,
        ),
        React.createElement("div", { className: "dsh-rb-files" }, rows),
        React.createElement(
          "div",
          { className: "dsh-rb-stats" },
          `共 ${p.files ? p.files.length : 0} 个文件,+${p.addedTotal} 行,−${p.deletedTotal} 行`,
        ),
        React.createElement(
          "div",
          { className: "dsh-rb-actions" },
          React.createElement("button", { className: "dsh-rb-cancel", onClick: closeDialog }, "取消"),
          React.createElement("button", { className: "dsh-rb-confirm", onClick: () => void applyUndo() }, "确认撤销"),
        ),
      );
      break;
    }
    case "applying":
      body = React.createElement("div", null, React.createElement("div", { className: "dsh-rb-dialog-title" }, "正在撤销…"));
      break;
    default:
      body = React.createElement(
        "div",
        null,
        React.createElement(
          "div",
          { className: "dsh-rb-dialog-title" },
          state.phase === "done" && state.ok ? "✓ 已撤销" : "撤销失败",
        ),
        React.createElement("div", { className: "dsh-rb-result" }, state.message || ""),
        React.createElement(
          "div",
          { className: "dsh-rb-actions" },
          React.createElement("button", { className: "dsh-rb-confirm", onClick: closeDialog }, "关闭"),
        ),
      );
  }

  return React.createElement(
    "div",
    { className: "dsh-rb-mask", onClick: closeDialog },
    React.createElement(
      "div",
      { className: "dsh-rb-dialog", onClick: (e: React.MouseEvent) => e.stopPropagation() },
      body,
    ),
  );
}

/** 回合分隔线(turnTail)。 */
function TurnRestoreDivider(props: { matched?: { turn?: unknown } | null; sessionId?: unknown }): React.ReactNode {
  const matched = props.matched;
  const turn = matched && typeof matched.turn === "number" ? matched.turn : undefined;
  const sessionId = props.sessionId;
  React.useEffect(() => {
    ensureCss();
  }, []);
  if (!(typeof turn === "number") || typeof sessionId !== "string") return null;
  return React.createElement(
    "div",
    { className: "dsh-rb-divider" },
    React.createElement(
      "button",
      { className: "dsh-rb-btn", onClick: () => openDialog(sessionId, turn) },
      "还原检查点",
    ),
  );
}

/** 网页端插件入口。 */
export function apply(ctx: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = (ctx as any).get ? (ctx as any).get("slots") : undefined;
  if (!slots) return;

  ensureCss();

  slots.inject("conversation.chat.turnTail", () =>
    slots.register(
      {
        name: "conversation.chat.turnTail",
        select: (owner: { turn?: { status?: string; turn?: number } }) => {
          const t = owner && owner.turn;
          if (!t || t.status !== "closed") return null;
          return { turn: t.turn };
        },
      },
      (props: { matched?: { turn?: unknown } | null; sessionId?: unknown }) =>
        React.createElement(TurnRestoreDivider, props),
    ),
  );

  slots.inject("shell.overlay", () =>
    slots.register(
      { name: "shell.overlay", id: "dsh-git-rollback-dialog", order: 100 },
      () => React.createElement(RestoreDialog),
    ),
  );
}

// 卸载时清理样式
export function dispose(): void {
  removeCss();
}
