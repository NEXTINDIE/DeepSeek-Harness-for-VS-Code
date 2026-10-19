import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { createTranslator } from "../dsh/i18n";
import { ChatChannel } from "./channel";

const t = createTranslator();

/**
 * 侧边栏聊天视图(活动栏 DeepSeek Harness 图标下的"聊天"视图)。
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "dsh.chatView";

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
    private readonly log?: (line: string) => void,
  ) {}

  /** 最近一次解析出来的通道(能力探测完成后用它把变化推给界面)。 */
  private channel: ChatChannel | undefined;

  /** 思考翻译能力变化:转发给 webview(不可用时隐藏「译」按钮)。 */
  postCotTranslation(): void {
    this.channel?.postCotTranslation();
  }

  /** DeepSeek 账号状态变化:转发给 webview(设置页账号卡片自动刷新余额)。 */
  postAccountState(view?: Parameters<ChatChannel["postAccountState"]>[0]): void {
    this.channel?.postAccountState(view);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const channel = new ChatChannel(this.hub, this.ctx, {
      webview: webviewView.webview,
      onDidDispose: webviewView.onDidDispose,
      dispose: () => {
        // 视图生命周期由 VS Code 管理,无需主动销毁
      },
      log: (line) => this.log?.(line),
      // 侧边栏视图无法由扩展重建(实例归工作台所有);重载窗口是最可靠的一次性恢复,
      // 服务器进程独立于扩展宿主,重载后自动重连,会话数据不丢失。
      onBootFailed: () => {
        this.log?.(`[boot] 聊天视图预载失败,提示用户重载窗口(viewType=${webviewView.viewType})`);
        void vscode.window
          .showErrorMessage(t("webview.bootFailed"), t("webview.bootReload"))
          .then((pick) => {
            if (pick === t("webview.bootReload")) void vscode.commands.executeCommand("workbench.action.reloadWindow");
          });
      },
    });
    this.channel = channel;
  }
}
