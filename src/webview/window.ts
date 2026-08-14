import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { ChatChannel } from "./channel";
import { folderCwd } from "../dsh/participantSessions";

/**
 * 编辑器区聊天标签页:每个会话一个 WebviewPanel(像 Claude Code 的 VS Code 插件一样,
 * 对话以标签页形式出现在编辑器区域,可通过顶部标签栏与代码文件来回切换)。
 */
export class ChatWindowProvider {
  static readonly viewType = "dsh.chatWindow";

  private panels = new Map<string, { panel: vscode.WebviewPanel; channel: ChatChannel }>();

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  /** 打开指定会话的标签页;未指定时用当前会话,无当前会话则新建。已打开则聚焦。 */
  async open(sessionId?: string): Promise<vscode.WebviewPanel | undefined> {
    const ready = await this.hub.ensureReady();
    if (!ready.ok) return undefined;
    let sid = sessionId ?? this.hub.store.currentSessionId;
    if (!sid) {
      try {
        sid = await this.hub.createSession(folderCwd());
      } catch {
        return undefined;
      }
    }
    const existing = this.panels.get(sid);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      return existing.panel;
    }
    const panel = vscode.window.createWebviewPanel(
      ChatWindowProvider.viewType,
      this.titleFor(sid),
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
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "icon.svg");
    const channel = new ChatChannel(this.hub, this.ctx, {
      webview: panel.webview,
      onDidDispose: panel.onDidDispose,
      dispose: () => panel.dispose(),
    }, {
      lockSession: sid,
      onNewTab: () => void this.openNew(),
    });
    // 标签页标题跟随会话标题(重命名/新会话时更新)
    const titleSub = this.hub.store.on("sessionsChanged", () => {
      panel.title = this.titleFor(sid);
    });
    panel.onDidDispose(() => {
      titleSub();
      this.panels.delete(sid);
    });
    this.panels.set(sid, { panel, channel });
    return panel;
  }

  /** 新建会话并打开对应标签页。 */
  async openNew(): Promise<vscode.WebviewPanel | undefined> {
    const ready = await this.hub.ensureReady();
    if (!ready.ok) return undefined;
    try {
      const sessionId = await this.hub.createSession(folderCwd());
      void this.hub.applyDefaultReasoningEffort(sessionId);
      return await this.open(sessionId);
    } catch {
      return undefined;
    }
  }

  /** 当前打开的标签页数量。 */
  get openTabs(): number {
    return this.panels.size;
  }

  private titleFor(sessionId: string): string {
    const s = this.hub.store.sessions.get(sessionId);
    return s?.title || sessionId.slice(0, 16);
  }
}
