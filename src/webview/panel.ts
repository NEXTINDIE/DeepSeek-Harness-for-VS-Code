import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { ChatChannel } from "./channel";
import type { ChatWindowProvider } from "./window";

/**
 * 侧边栏会话列表视图(活动栏 DeepSeek Harness 图标):列出所有会话,
 * 点击会话在编辑器标签页中打开对话(聊天主体位于编辑器区域,类似 Claude Code 的体验)。
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "dsh.chatView";

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
    private readonly windowProvider: ChatWindowProvider,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    new ChatChannel(this.hub, this.ctx, {
      webview: webviewView.webview,
      onDidDispose: webviewView.onDidDispose,
      dispose: () => {
        // 视图生命周期由 VS Code 管理,无需主动销毁
      },
    }, {
      mode: "list",
      onOpenTab: (sessionId) => void this.windowProvider.open(sessionId),
      onNewTab: () => void this.windowProvider.openNew(),
    });
  }
}
