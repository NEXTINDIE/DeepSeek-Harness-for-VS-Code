import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import { createTranslator, effectiveLanguage } from "../dsh/i18n";
import type { DshHub } from "../dsh/hub";
import type { CordisPluginRow, CordisRequestRun } from "../dsh/cordisTypes";

const t = createTranslator();

/**
 * Cordis 动态插件面板(网页端 Cordis 浮窗面板同款):编辑器区单例 WebviewPanel。
 * 展示插件清单 / 运行状态 / 审批(仅允许此版本 / 允许后续版本 / 拒绝)/ 运行 / 停止 / 移除,
 * 由 host/remote-event(cordis/*)驱动实时刷新。
 */
export class CordisPanelProvider {
  static readonly viewType = "dsh.cordisPanel";

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private cssCache: string | undefined;

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  open(): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return this.panel;
    }
    this.panel = vscode.window.createWebviewPanel(
      CordisPanelProvider.viewType,
      t("cordis.panelTitle") ?? "Cordis plugins",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "dist"), vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
      },
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "icon.png");
    this.panel.webview.html = this.html(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg: { kind?: string; [key: string]: unknown }) => void this.onMessage(msg), undefined, this.disposables);
    this.panel.onDidDispose(() => {
      for (const d of this.disposables) d.dispose();
      this.disposables = [];
      this.panel = undefined;
    });
    this.disposables.push({
      dispose: this.hub.onRemoteEvent((event: string) => {
        // 插件生命周期事件(审批请求 / 解决 / 定义 / 移除):权威刷新清单
        if (event.startsWith("cordis/")) void this.pushInventory();
      }),
    });
    void this.pushInventory();
    this.post({ kind: "lang", lang: effectiveLanguage() });
    return this.panel;
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  private post(message: unknown) {
    if (this.panel) void this.panel.webview.postMessage(message);
  }

  private notice(message: string, level: "info" | "warning" | "error" = "info") {
    this.post({ kind: "notice", notice: { message, level } });
  }

  private async pushInventory() {
    if (!this.panel) return;
    try {
      const rows: CordisPluginRow[] = await this.hub.cordisInventory();
      this.post({ kind: "inventory", rows, agentId: this.hub.store.currentSessionId ?? "" });
    } catch (error) {
      this.notice(t("cordis.inventoryFailed", { message: String(error) }) ?? `Reading the plugin inventory failed: ${String(error)}`, "error");
    }
  }

  /** 由清单行重建审批请求上下文(runHostHalf 需要完整参数)。 */
  private requestFromRow(row: CordisPluginRow, requestId: string): CordisRequestRun | undefined {
    const latest = row.latestRun;
    if (!latest || latest.approvalRequestId !== requestId) return undefined;
    const pkg = row.packages.find((p) => p.packageId === latest.packageId);
    return {
      requestId,
      agentId: row.agentId,
      pluginId: row.pluginId,
      packageId: latest.packageId,
      mode: latest.mode,
      name: pkg?.name ?? row.pluginId,
      purpose: pkg?.purpose ?? "",
      requiresApproval: true,
    };
  }

  private async onMessage(msg: { kind?: string; [key: string]: unknown }) {
    if (!this.panel) return;
    switch (msg.kind) {
      case "refresh":
        await this.pushInventory();
        break;
      case "approve": {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        if (!requestId) break;
        // 从最新清单定位请求(避免陈旧上下文)
        try {
          const rows = await this.hub.cordisInventory();
          const row = rows.find((r) => r.latestRun?.approvalRequestId === requestId);
          const request = row ? this.requestFromRow(row, requestId) : undefined;
          if (!request) {
            this.notice(t("cordis.requestGone") ?? "This run request is no longer pending", "warning");
            break;
          }
          const result = await this.hub.cordisApprove(request, msg.approveFutureVersions === true);
          if (result.ok) this.notice(t("cordis.approved") ?? "Plugin approved and started");
          else this.notice(t("cordis.approveFailed", { message: result.message ?? "" }) ?? `Approval failed: ${result.message}`, "error");
        } catch (error) {
          this.notice(t("cordis.approveFailed", { message: String(error) }) ?? `Approval failed: ${String(error)}`, "error");
        }
        await this.pushInventory();
        break;
      }
      case "reject": {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        if (!requestId) break;
        const result = await this.hub.cordisReject(requestId);
        if (!result.ok) this.notice(t("cordis.rejectFailed", { message: result.message ?? "" }) ?? `Decline failed: ${result.message}`, "error");
        await this.pushInventory();
        break;
      }
      case "run": {
        const agentId = typeof msg.agentId === "string" ? msg.agentId : "";
        const pluginId = typeof msg.pluginId === "string" ? msg.pluginId : "";
        const packageId = typeof msg.packageId === "string" ? msg.packageId : "";
        const mode = msg.mode === "update" ? "update" : "run";
        if (!agentId || !pluginId || !packageId) break;
        const result = await this.hub.cordisRun(agentId, pluginId, packageId, mode);
        if (result.ok) this.notice(t("cordis.started") ?? "Plugin run started");
        else this.notice(t("cordis.runFailed", { message: result.message ?? "" }) ?? `Run failed: ${result.message}`, "error");
        await this.pushInventory();
        break;
      }
      case "stop": {
        const agentId = typeof msg.agentId === "string" ? msg.agentId : "";
        const pluginId = typeof msg.pluginId === "string" ? msg.pluginId : "";
        if (!agentId || !pluginId) break;
        const result = await this.hub.cordisStop(agentId, pluginId);
        if (!result.ok && result.reason !== "not-running") {
          this.notice(t("cordis.stopFailed", { message: result.message }) ?? `Stop failed: ${result.message}`, "error");
        }
        await this.pushInventory();
        break;
      }
      case "remove": {
        const agentId = typeof msg.agentId === "string" ? msg.agentId : "";
        const pluginId = typeof msg.pluginId === "string" ? msg.pluginId : "";
        if (!agentId || !pluginId) break;
        const result = await this.hub.cordisUndefine(agentId, pluginId);
        if (result.ok) this.notice(t("cordis.removed") ?? "Plugin removed");
        else this.notice(t("cordis.removeFailed", { message: result.message }) ?? `Remove failed: ${result.message}`, "error");
        await this.pushInventory();
        break;
      }
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "dist", "webview", "cordis.js"));
    const csp = [
      "default-src 'none'",
      "img-src ${webview.cspSource} data:",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    const lang = effectiveLanguage();
    const htmlLang = lang === "zh-cn" ? "zh-CN" : lang === "zh-tw" ? "zh-TW" : lang;
    const htmlDir = lang === "ar" ? "rtl" : "ltr";
    return `<!DOCTYPE html>
<html lang="${htmlLang}" dir="${htmlDir}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${this.css()}
  </style>
  <title>Cordis</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private css(): string {
    if (this.cssCache === undefined) {
      try {
        this.cssCache = readFileSync(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "cordis.css").fsPath, "utf8");
      } catch {
        this.cssCache = "";
      }
    }
    return this.cssCache;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
