import * as vscode from "vscode";
import { DshHub, type HubStatus } from "./dsh/hub";
import { createTranslator } from "./dsh/i18n";
import { registerChatParticipant } from "./dsh/chatParticipant";
import { folderCwd, setParticipantSession } from "./dsh/participantSessions";
import { ChatPanelProvider } from "./webview/panel";
import { ChatWindowProvider } from "./webview/window";

export function activate(ctx: vscode.ExtensionContext) {
  const t = createTranslator();
  const cfg = () => vscode.workspace.getConfiguration("dsh");
  const dshUrl = () => cfg().get<string>("url", "http://127.0.0.1:3080");

  // ---------- 辅助侧栏能力检测(viewsContainers.secondarySidebar 自 VS Code 1.106 起可用) ----------
  // package.json 中活动栏容器与辅助侧栏容器通过 dsh:supportsSecondarySidebar 条件互斥:
  // 新版放辅助侧栏(用户期望的 tab 位置),旧版回退活动栏,避免"容器不存在"警告与视图丢失。
  const supportsSecondarySidebar = detectSecondarySidebarSupport(vscode.version);
  void vscode.commands.executeCommand("setContext", "dsh:supportsSecondarySidebar", supportsSecondarySidebar);

  // ---------- 日志通道(排查"扩展没有出现"问题的第一现场) ----------
  const output = vscode.window.createOutputChannel("DeepSeek Harness");
  output.appendLine(`[activate] 扩展已激活 · VS Code ${vscode.version} · 扩展版本 ${ctx.extension.packageJSON.version}`);
  output.appendLine(`[activate] 辅助侧栏容器支持: ${supportsSecondarySidebar ? `是(容器位于辅助侧栏)` : `否(VS Code < 1.106,容器回退到活动栏)`}`);
  let lastStatusKey = "";

  const hub = new DshHub({
    url: dshUrl(),
    command: cfg().get<string>("command", "dsh"),
    autoStart: cfg().get<boolean>("autoStart", true),
    autoStartTimeoutSec: cfg().get<number>("autoStartTimeoutSec", 60),
    cwd: folderCwd,
    t: (key, args) => t(key, args ?? {}),
    defaultReasoningEffort: cfg().get<string>("defaultReasoningEffort", ""),
    onNotice: (message, kind) => {
      output.appendLine(`[notice] ${kind}: ${message}`);
      if (kind === "error") void vscode.window.showErrorMessage(`DSH: ${message}`);
      else void vscode.window.showWarningMessage(`DSH: ${message}`);
    },
    onStatus: (status) => {
      const key = `${status.serverUp}|${status.muxConnected}|${status.serverStarting}`;
      if (key !== lastStatusKey) {
        lastStatusKey = key;
        output.appendLine(
          `[status] serverUp=${status.serverUp} muxConnected=${status.muxConnected} serverStarting=${status.serverStarting}${status.message ? ` · ${status.message}` : ""}`,
        );
      }
    },
    onLog: (message) => output.appendLine(message),
  });
  output.appendLine(`[activate] 服务器地址 ${dshUrl()}`);

  // ---------- 工作区自动同步 ----------
  // 把 VS Code 当前打开的文件夹自动采纳为 DSH 工作区(workspace.create),
  // 无需在 GUI 里手动"添加工作区";切换文件夹时自动跟随(多根工作区跟随活动编辑器)。
  let syncedFolder: string | undefined;
  const syncWorkspace = async () => {
    const path = folderCwd();
    if (!path || path === syncedFolder) return;
    if (await hub.adoptWorkspace(path)) {
      syncedFolder = path;
      output.appendLine(`[workspace] 已同步工作区: ${path}`);
    }
  };
  hub.onStatus((status) => {
    if (status.serverUp && status.muxConnected) void syncWorkspace();
  });
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void syncWorkspace()),
    vscode.window.onDidChangeActiveTextEditor(() => void syncWorkspace()),
  );

  // ---------- 界面:视图 provider 优先注册 ----------
  // 必须在视图被解析之前完成注册;视图条目在 package.json 中声明 "type": "webview",
  // 否则 VS Code 会按默认 tree 视图处理,去找不存在的树数据提供者并显示占位文案。
  const registerViewProviders = () => {
    const provider = new ChatPanelProvider(hub, ctx);
    ctx.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.window.registerWebviewViewProvider("dsh.chatViewSecondary", provider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    );
    output.appendLine("[activate] 视图 provider 已注册(dsh.chatView / dsh.chatViewSecondary)");
  };
  registerViewProviders();
  const chatWindow = new ChatWindowProvider(hub, ctx);

  // ---------- 状态栏 ----------
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const renderStatusBar = (status: HubStatus) => {
    if (status.serverUp && status.muxConnected) {
      statusBar.text = status.model ? t("status.connected", { model: status.model }) : t("status.connectedPlain");
      statusBar.tooltip = t("status.connectedTooltip", { url: dshUrl() });
    } else if (status.serverStarting) {
      statusBar.text = "$(sync~spin) " + t("status.starting");
      statusBar.tooltip = t("status.startingTooltip");
    } else {
      statusBar.text = "$(comment-discussion) " + t("status.disconnected");
      statusBar.tooltip = t("status.disconnectedTooltip", { url: dshUrl() });
    }
  };
  hub.onStatus(renderStatusBar);
  statusBar.command = "dsh.openChat";
  statusBar.show();
  ctx.subscriptions.push(statusBar);

  // ---------- 内置聊天参与者 @dsh ----------
  try {
    const participant = registerChatParticipant(hub, ctx);
    if (participant) {
      ctx.subscriptions.push(participant);
      output.appendLine("[activate] @dsh 聊天参与者已注册(内置 Chat 输入 @ 可选)");
    } else {
      output.appendLine("[activate] @dsh 聊天参与者不可用:需要 VS Code ≥ 1.95(其余功能不受影响)");
    }
  } catch (error) {
    output.appendLine(`[activate] @dsh 聊天参与者注册失败(不影响视图): ${String(error)}`);
  }

  // ---------- 命令 ----------
  /** 打开内置聊天窗口并预选 @dsh 参与者(与 ChatGPT 等参与者同框)。 */
  async function openBuiltInChat() {
    await openChatQuery("@dsh ", true);
  }

  /** 打开内置 Chat 并写入查询(partial=true 只填入不提交)。 */
  async function openChatQuery(query: string, partial: boolean) {
    try {
      await vscode.commands.executeCommand("workbench.action.chat.open", { query, isPartialQuery: partial });
    } catch {
      chatWindow.open();
    }
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand("dsh.openChat", async () => {
      await openBuiltInChat();
    }),
    vscode.commands.registerCommand("dsh.openChatWindow", () => {
      chatWindow.open();
    }),
    vscode.commands.registerCommand("dsh.openSidebar", async () => {
      if (supportsSecondarySidebar) {
        try {
          await vscode.commands.executeCommand("dsh.chatViewSecondary.focus");
          return;
        } catch {
          // 视图未实例化时回退
        }
      }
      await vscode.commands.executeCommand("dsh.chatView.focus");
    }),
    vscode.commands.registerCommand("dsh.askSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage(t("msg.noActiveEditor"));
        return;
      }
      const text = editor.document.getText(editor.selection);
      const file = vscode.workspace.asRelativePath(editor.document.uri);
      const line = editor.selection.start.line + 1;
      const lang = editor.document.languageId;
      await openChatQuery(
        `@dsh 请查看这段代码 \`${file}:${line}\`:\n\n\`\`\`${lang}\n${text.slice(0, 12000)}\n\`\`\`\n\n`,
        true,
      );
    }),
    vscode.commands.registerCommand("dsh.askFile", async (arg?: vscode.Uri) => {
      const uri = arg ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        void vscode.window.showWarningMessage(t("msg.noFile"));
        return;
      }
      let content = "";
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > 2 * 1024 * 1024) {
          content = "(文件超过 2MB,已省略内容)";
        } else {
          content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        }
      } catch {
        content = "(无法读取文件)";
      }
      await openChatQuery(
        `@dsh 请查看这个文件 \`${vscode.workspace.asRelativePath(uri)}\`:\n\n\`\`\`\n${content.slice(0, 12000)}\n\`\`\`\n\n`,
        true,
      );
    }),
    vscode.commands.registerCommand("dsh.newChat", async () => {
      const ready = await hub.ensureReady();
      if (!ready.ok) return;
      try {
        const sessionId = await hub.createSession(folderCwd());
        await setParticipantSession(ctx, sessionId);
        void vscode.window.showInformationMessage(t("msg.newSession", { id: sessionId.slice(0, 20) }));
      } catch (error) {
        void vscode.window.showErrorMessage(t("msg.newSessionFailed", { error: String(error) }));
      }
      await openBuiltInChat();
    }),
    vscode.commands.registerCommand("dsh.selectSession", async () => {
      const ready = await hub.ensureReady();
      if (!ready.ok) return;
      const sessions = hub.store.listSessions();
      if (sessions.length === 0) {
        void vscode.window.showInformationMessage(t("msg.noSessions"));
        return;
      }
      const picked = await vscode.window.showQuickPick(
        sessions.map((s) => ({
          label: s.title || s.sessionId.slice(0, 24),
          description: `${s.sessionId}${s.agentPreset ? ` · ${s.agentPreset}` : ""}`,
          sessionId: s.sessionId,
        })),
        { placeHolder: "选择 DSH 会话" },
      );
      if (picked) await hub.openSession(picked.sessionId);
    }),
    vscode.commands.registerCommand("dsh.stop", async () => {
      const current = hub.store.currentSessionId;
      if (current) await hub.cancel(current);
    }),
    vscode.commands.registerCommand("dsh.startServer", async () => {
      const ready = await hub.ensureReady();
      if (ready.ok) void vscode.window.showInformationMessage(t("msg.serverReady", { url: dshUrl() }));
    }),
    vscode.commands.registerCommand("dsh.stopServer", async () => {
      const result = await hub.server.stop();
      if (result.ok) void vscode.window.showInformationMessage(t("msg.serverStopped"));
      else void vscode.window.showWarningMessage(t("msg.cannotStopServer", { message: result.message ?? "" }));
    }),
    vscode.commands.registerCommand("dsh.openInBrowser", async () => {
      await vscode.env.openExternal(vscode.Uri.parse(dshUrl()));
    }),
    vscode.commands.registerCommand("dsh.showOutput", () => {
      output.show(true);
    }),
    vscode.commands.registerCommand("dsh.repairViews", async () => {
      // 一键修复"没有已注册数据提供程序"占位状态:重置视图位置,清除历史布局中缓存的失效视图实例
      try {
        await vscode.commands.executeCommand("workbench.action.resetViewLocations");
        void vscode.window.showInformationMessage(t("msg.repairDone"));
      } catch {
        void vscode.window.showInformationMessage(t("msg.repairManual"));
      }
    }),
    vscode.commands.registerCommand("dsh.showInfo", async () => {
      const chat = vscode.chat as unknown as { createChatParticipant?: unknown } | undefined;
      const chatApi = typeof chat?.createChatParticipant === "function";
      const info = [
        `VS Code 版本:${vscode.version}`,
        `扩展已激活:是`,
        `内置聊天参与者 API:${chatApi ? "可用(@dsh 已注册,在 Chat 输入框输入 @ 选择 dsh)" : "不可用(需要 VS Code ≥ 1.95)"}`,
        `服务器:${dshUrl()} — ${hub.status.serverUp ? "在线" : "离线(首次使用时自动启动)"}`,
        `事件流:${hub.status.muxConnected ? "已连接" : "未连接"}`,
        `模型:${hub.status.model ?? "-"}`,
        `会话数:${hub.store.listSessions().length}`,
        `当前项目:${folderCwd() ?? "(无工作区文件夹)"}`,
        `辅助侧栏 tab:${supportsSecondarySidebar ? "支持(已注册到辅助侧栏)" : "不支持(VS Code < 1.106,图标回退到活动栏;升级 VS Code 后自动出现)"}`,
        "",
        "若聊天视图报 \"Could not register service worker\" 错误:",
        "1. 这是 VS Code 平台缺陷(1.100.x 常见),与扩展代码无关;",
        "2. 先试:命令面板 → Developer: Reload Window;",
        "3. 再试:帮助 → 检查更新,升级到最新版 VS Code;",
        "4. 仍失败:完全退出 VS Code,删除 %APPDATA%\\Code\\Service Worker\\CacheStorage 与 %APPDATA%\\Code\\Cache\\Cache_Data 后重启;",
        "5. 最后手段:从 code.visualstudio.com 重装 VS Code(95% 成功率,扩展会自动同步回来)。",
      ].join("\n");
      void vscode.window.showInformationMessage(info, { modal: true }, "打开内置聊天").then((pick) => {
        if (pick === "打开内置聊天") void vscode.commands.executeCommand("dsh.openChat");
      });
    }),
    // 参与者按钮与面板共用:审批应答
    vscode.commands.registerCommand("dsh.respond", async (args?: { sessionId: string; approvalId: string; outcome: "allowed-once" | "rejected" }) => {
      if (!args?.approvalId) return;
      await hub.respondApproval(args.sessionId, args.approvalId, args.outcome);
    }),
    // 参与者按钮与面板共用:提问应答
    vscode.commands.registerCommand(
      "dsh.respondQuestion",
      async (args?: { sessionId: string; frameRpcId: string; answers: { id: string; selected: string[]; custom?: string }[] }) => {
        if (!args?.frameRpcId) return;
        await hub.respondQuestion(args.sessionId, args.frameRpcId, args.answers);
      },
    ),
  );

  // ---------- 配置变更 ----------
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dsh.url")) {
        void vscode.window
          .showInformationMessage(t("msg.reloadTitle"), t("msg.reloadAction"))
          .then((pick) => {
            if (pick === t("msg.reloadAction")) void vscode.commands.executeCommand("workbench.action.reloadWindow");
          });
      }
    }),
  );

  // ---------- 启动 ----------
  // 启动时先探测;若服务器离线且 dsh.autoStart=true,立即自动启动 dsh web。
  // 启动失败后每 15 秒重新探测:服务器一旦上线(手动启动 / npx 下载完成)自动连接,无需手动重试。
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  const stopWatcher = () => {
    if (watchTimer !== undefined) {
      clearInterval(watchTimer);
      watchTimer = undefined;
    }
  };
  const watchServer = () => {
    if (watchTimer !== undefined) return;
    output.appendLine("[activate] 服务器离线,每 15 秒重新探测,上线后自动连接");
    watchTimer = setInterval(() => {
      void hub.probe().then((ok) => {
        if (ok) {
          output.appendLine("[activate] 服务器已上线,停止探测");
          stopWatcher();
        }
      });
    }, 15_000);
  };
  void (async () => {
    const ok = await hub.probe();
    output.appendLine(`[activate] 服务器探测结果: ${ok ? "在线" : "离线"}`);
    if (!ok) {
      if (cfg().get<boolean>("autoStart", true)) {
        output.appendLine("[activate] dsh.autoStart=true · 服务器离线,启动时自动启动…");
        const ensured = await hub.ensureReady();
        output.appendLine(`[activate] 启动时自动启动结果: ${ensured.ok ? "成功" : `失败 · ${ensured.message ?? "未知错误"}`}`);
        if (ensured.ok) {
          void syncWorkspace();
          return;
        }
      }
      watchServer();
    }
  })();
  output.appendLine("[activate] 注册完成 · 活动栏图标 / 辅助侧栏 tab / 命令与右键菜单均来自 package.json 静态贡献");
  // 可选:启动时自动打开独立聊天窗口(默认关闭;主入口是内置 Chat 的 @dsh)
  if (cfg().get<boolean>("openPanelOnStartup", false)) {
    setTimeout(() => chatWindow.open(), 800);
  }

  ctx.subscriptions.push({ dispose: () => { stopWatcher(); hub.dispose(); } });
}

export function deactivate() {
  // 清理由 ctx.subscriptions 中的 hub.dispose() 完成
}

/** 解析 VS Code 版本号,判断是否支持 viewsContainers.secondarySidebar(≥ 1.106)。 */
function detectSecondarySidebarSupport(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > 1 || (major === 1 && minor >= 106);
}
