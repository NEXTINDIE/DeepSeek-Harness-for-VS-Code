import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { ChatChannel } from "./channel";

/**
 * 侧边栏聊天视图(活动栏 DeepSeek Harness 图标下的"聊天"视图)。
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "dsh.chatView";

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    new ChatChannel(this.hub, this.ctx, {
      webview: webviewView.webview,
      onDidDispose: webviewView.onDidDispose,
      dispose: () => {
        // 视图生命周期由 VS Code 管理,无需主动销毁
      },
    });
  }
}
