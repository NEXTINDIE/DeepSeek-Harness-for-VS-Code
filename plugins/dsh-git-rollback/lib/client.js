window.__ModuleLoader__.load({
  id: "dsh-git-rollback/client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
    
    // src/client/index.ts
    var index_exports = {};
    __export(index_exports, {
      apply: () => apply,
      dispose: () => dispose
    });
    module.exports = __toCommonJS(index_exports);
    var React = require("react");
    var styleEl = null;
    function ensureCss() {
      if (styleEl) return;
      styleEl = document.createElement("style");
      styleEl.textContent = ".dsh-rb-divider{display:flex;align-items:center;justify-content:center;margin:10px 0;position:relative}.dsh-rb-divider::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:var(--dsw-alias-border-l1)}.dsh-rb-btn{position:relative;z-index:1;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;padding:4px 16px;cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s}.dsh-rb-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}.dsh-rb-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999}.dsh-rb-dialog{min-width:380px;max-width:600px;max-height:70vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 40px rgba(0,0,0,.4);padding:16px 18px;font-size:13px;color:var(--dsw-alias-label-primary);line-height:1.5}.dsh-rb-dialog-title{font-weight:600;font-size:13.5px;margin-bottom:4px}.dsh-rb-dialog-sub{margin-bottom:10px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}.dsh-rb-files{max-height:220px;overflow-y:auto;margin:4px 0 8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}.dsh-rb-file{display:flex;align-items:baseline;gap:8px;padding:2px 0}.dsh-rb-file-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-rb-file-add{color:var(--dsw-alias-state-success-primary)}.dsh-rb-file-del{color:var(--dsw-alias-state-error-primary)}.dsh-rb-empty{color:var(--dsw-alias-label-secondary);font-size:11.5px}.dsh-rb-stats{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}.dsh-rb-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}.dsh-rb-confirm{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-radius:7px;padding:6px 20px;font-size:12.5px;font-weight:600;cursor:pointer}.dsh-rb-confirm:hover{filter:brightness(1.1)}.dsh-rb-cancel{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:6px 18px;font-size:12.5px;cursor:pointer}.dsh-rb-cancel:hover{background:var(--dsw-alias-bg-layer-1)}.dsh-rb-result{margin-top:8px;font-size:11.5px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary)}";
      document.head.appendChild(styleEl);
    }
    function removeCss() {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    }
    async function callApi(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const value = await res.json();
      return value;
    }
    var dialog = null;
    var dialogListeners = /* @__PURE__ */ new Set();
    function openDialog(sessionId, turn) {
      dialog = { sessionId, turn };
      for (const fn of dialogListeners) fn();
    }
    function closeDialog() {
      dialog = null;
      for (const fn of dialogListeners) fn();
    }
    function subscribeDialog(fn) {
      dialogListeners.add(fn);
      return () => {
        dialogListeners.delete(fn);
      };
    }
    function fileRow(f) {
      const badge = f.binary ? React.createElement("span", { className: "dsh-rb-empty", key: "b" }, "\u4E8C\u8FDB\u5236") : [
        f.added > 0 ? React.createElement("span", { className: "dsh-rb-file-add", key: "a" }, `+${f.added}`) : null,
        f.deleted > 0 ? React.createElement("span", { className: "dsh-rb-file-del", key: "d" }, `\u2212${f.deleted}`) : null
      ];
      return React.createElement(
        "div",
        { className: "dsh-rb-file", key: f.path },
        React.createElement("span", { className: "dsh-rb-file-path", title: f.path }, f.path),
        badge
      );
    }
    function RestoreDialog() {
      const [state, setState] = React.useState({ phase: "closed" });
      React.useEffect(() => {
        ensureCss();
        const unsub = subscribeDialog(() => {
          const d = dialog;
          if (d) setState({ phase: "idle", sessionId: d.sessionId, turn: d.turn });
          else setState({ phase: "closed" });
        });
        const onKey = (e) => {
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
      const openPreview = async () => {
        setState({ phase: "loading", sessionId, turn });
        try {
          const preview = await callApi("/dsh-rollback/preview", { sessionId, turn });
          if (preview && preview.error) setState({ phase: "error", sessionId, turn, message: String(preview.error) });
          else if (preview) setState({ phase: "confirm", sessionId, turn, preview });
          else setState({ phase: "error", sessionId, turn, message: "\u9884\u89C8\u5931\u8D25" });
        } catch (err) {
          setState({ phase: "error", sessionId, turn, message: String(err instanceof Error ? err.message : err) });
        }
      };
      const applyUndo = async () => {
        setState({ phase: "applying", sessionId, turn });
        try {
          const result = await callApi("/dsh-rollback/apply", { sessionId, turn });
          setState({
            phase: "done",
            sessionId,
            turn,
            ok: !!(result && result.ok),
            message: result && result.text ? String(result.text) : result && result.error ? String(result.error) : "\u5DF2\u6267\u884C"
          });
        } catch (err) {
          setState({ phase: "error", sessionId, turn, message: String(err instanceof Error ? err.message : err) });
        }
      };
      let body;
      switch (state.phase) {
        case "idle":
        case "loading":
          body = React.createElement(
            "div",
            null,
            React.createElement("div", { className: "dsh-rb-dialog-title" }, "\u8FD8\u539F\u68C0\u67E5\u70B9"),
            React.createElement(
              "div",
              { className: "dsh-rb-dialog-sub" },
              `\u56DE\u5408 ${turn} \u2014 \u5C06\u64A4\u9500\u8BE5\u56DE\u5408\u4EA7\u751F\u7684\u4EE5\u4E0B\u6539\u52A8(\u4F60\u7684\u63D0\u4EA4\u4E0E HEAD \u4E0D\u53D7\u5F71\u54CD):`
            ),
            state.phase === "loading" ? React.createElement("div", { className: "dsh-rb-empty" }, "\u8BA1\u7B97\u5DEE\u5F02\u2026") : React.createElement(
              "div",
              { className: "dsh-rb-actions" },
              React.createElement("button", { className: "dsh-rb-cancel", onClick: closeDialog }, "\u53D6\u6D88"),
              React.createElement("button", { className: "dsh-rb-confirm", onClick: () => void openPreview() }, "\u67E5\u770B\u6539\u52A8")
            )
          );
          break;
        case "confirm": {
          const p = state.preview;
          const rows = p.files && p.files.length > 0 ? p.files.map(fileRow) : [React.createElement("div", { className: "dsh-rb-empty", key: "e" }, "\u8BE5\u56DE\u5408\u6CA1\u6709\u6587\u4EF6\u6539\u52A8")];
          body = React.createElement(
            "div",
            null,
            React.createElement("div", { className: "dsh-rb-dialog-title" }, "\u8FD8\u539F\u68C0\u67E5\u70B9"),
            React.createElement(
              "div",
              { className: "dsh-rb-dialog-sub" },
              `\u56DE\u5408 ${turn} \u2014 \u5C06\u64A4\u9500\u8BE5\u56DE\u5408\u4EA7\u751F\u7684\u4EE5\u4E0B\u6539\u52A8(\u4F60\u7684\u63D0\u4EA4\u4E0E HEAD \u4E0D\u53D7\u5F71\u54CD):`
            ),
            React.createElement("div", { className: "dsh-rb-files" }, rows),
            React.createElement(
              "div",
              { className: "dsh-rb-stats" },
              `\u5171 ${p.files ? p.files.length : 0} \u4E2A\u6587\u4EF6,+${p.addedTotal} \u884C,\u2212${p.deletedTotal} \u884C`
            ),
            React.createElement(
              "div",
              { className: "dsh-rb-actions" },
              React.createElement("button", { className: "dsh-rb-cancel", onClick: closeDialog }, "\u53D6\u6D88"),
              React.createElement("button", { className: "dsh-rb-confirm", onClick: () => void applyUndo() }, "\u786E\u8BA4\u64A4\u9500")
            )
          );
          break;
        }
        case "applying":
          body = React.createElement("div", null, React.createElement("div", { className: "dsh-rb-dialog-title" }, "\u6B63\u5728\u64A4\u9500\u2026"));
          break;
        default:
          body = React.createElement(
            "div",
            null,
            React.createElement(
              "div",
              { className: "dsh-rb-dialog-title" },
              state.phase === "done" && state.ok ? "\u2713 \u5DF2\u64A4\u9500" : "\u64A4\u9500\u5931\u8D25"
            ),
            React.createElement("div", { className: "dsh-rb-result" }, state.message || ""),
            React.createElement(
              "div",
              { className: "dsh-rb-actions" },
              React.createElement("button", { className: "dsh-rb-confirm", onClick: closeDialog }, "\u5173\u95ED")
            )
          );
      }
      return React.createElement(
        "div",
        { className: "dsh-rb-mask", onClick: closeDialog },
        React.createElement(
          "div",
          { className: "dsh-rb-dialog", onClick: (e) => e.stopPropagation() },
          body
        )
      );
    }
    function TurnRestoreDivider(props) {
      const matched = props.matched;
      const turn = matched && typeof matched.turn === "number" ? matched.turn : void 0;
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
          "\u8FD8\u539F\u68C0\u67E5\u70B9"
        )
      );
    }
    function apply(ctx) {
      const slots = ctx.get ? ctx.get("slots") : void 0;
      if (!slots) return;
      ensureCss();
      slots.inject(
        "conversation.chat.turnTail",
        () => slots.register(
          {
            name: "conversation.chat.turnTail",
            select: (owner) => {
              const t = owner && owner.turn;
              if (!t || t.status !== "closed") return null;
              return { turn: t.turn };
            }
          },
          (props) => React.createElement(TurnRestoreDivider, props)
        )
      );
      slots.inject(
        "shell.overlay",
        () => slots.register(
          { name: "shell.overlay", id: "dsh-git-rollback-dialog", order: 100 },
          () => React.createElement(RestoreDialog)
        )
      );
    }
    function dispose() {
      removeCss();
    }
    
    return module.exports;
  }
});
