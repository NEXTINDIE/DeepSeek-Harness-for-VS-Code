import * as vscode from "vscode";
import type { DshHub } from "../dsh/hub";
import { ChatChannel } from "./channel";
import { folderCwd } from "../dsh/participantSessions";
import { createTranslator } from "../dsh/i18n";

/** 宿主侧文案翻译(跟随 dsh.language 设置)。 */
const t = createTranslator();

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
      // 默认续接最新会话(与 Web 端一致),而不是新建空会话
      const latest = this.hub.store.listSessions()[0];
      sid = latest?.sessionId;
    }
    if (!sid) {
      try {
        sid = await this.hub.createSession(folderCwd());
      } catch {
        return undefined;
      }
    }
    const existing = this.panels.get(sid);
    if (existing) {
      // preserveFocus:保持当前焦点(用户可能正在侧边栏连续操作),不强制抢焦点
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

  /** 新建会话并打开对应标签页:先让用户选择默认当前工作区或指定工作区。 */
  async openNew(): Promise<vscode.WebviewPanel | undefined> {
    const ready = await this.hub.ensureReady();
    if (!ready.ok) return undefined;
    const cwd = await this.pickNewConversationCwd();
    if (cwd === undefined) return undefined; // 用户取消
    try {
      const sessionId = await this.hub.createSessionForFolder(cwd);
      void this.hub.applyDefaultReasoningEffort(sessionId);
      return await this.open(sessionId);
    } catch {
      return undefined;
    }
  }

  /** 新建对话的工作目录选择:默认当前工作区 / 指定工作区(已有工作区列表或浏览目录)。 */
  private async pickNewConversationCwd(): Promise<string | undefined> {
    const defaultCwd = folderCwd();
    const mode = await vscode.window.showQuickPick(
      [
        { label: t("默认当前工作区"), description: defaultCwd ?? t("(无文件夹)"), id: "default" },
        { label: t("指定工作区…"), id: "pick" },
      ],
      { placeHolder: t("新对话的工作目录") },
    );
    if (!mode) return undefined;
    if (mode.id === "default") return defaultCwd;
    let workspaces: { workspaceId: string; path: string; title: string }[] = [];
    try {
      const { items } = await this.hub.listWorkspaces();
      workspaces = items;
    } catch {
      // 列表不可用时仍可浏览目录
    }
    const picked = await vscode.window.showQuickPick(
      [
        ...workspaces.map((w) => ({
          label: w.title || w.path,
          description: w.path,
          id: "ws:" + w.workspaceId,
        })),
        { label: t("浏览目录…"), id: "browse" },
      ],
      { placeHolder: t("选择工作区目录") },
    );
    if (!picked) return undefined;
    if (picked.id === "browse") {
      const uri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: t("选择为工作区"),
      });
      return uri?.[0]?.fsPath;
    }
    const ws = workspaces.find((w) => "ws:" + w.workspaceId === picked.id);
    return ws?.path;
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
