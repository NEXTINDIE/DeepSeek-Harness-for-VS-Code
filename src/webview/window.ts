import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { ChatChannel } from "./channel";

/**
 * 独立聊天窗口:编辑器区(右侧)的单例 WebviewPanel,类似 Claude Code 的 VS Code 插件体验。
 */
export class ChatWindowProvider {
  static readonly viewType = "dsh.chatWindow";

  private panel: vscode.WebviewPanel | undefined;
  private channel: ChatChannel | undefined;

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  /** 打开窗口;已存在时仅聚焦。 */
  open(): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return this.panel;
    }
    this.panel = vscode.window.createWebviewPanel(
      ChatWindowProvider.viewType,
      "DeepSeek Harness",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, "dist"),
          vscode.Uri.joinPath(this.ctx.extensionUri, "media"),
        ],
      },
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "icon.png");
    this.channel = new ChatChannel(this.hub, this.ctx, {
      webview: this.panel.webview,
      onDidDispose: this.panel.onDidDispose,
      dispose: () => this.panel?.dispose(),
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.channel = undefined;
    });
    return this.panel;
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }
}
