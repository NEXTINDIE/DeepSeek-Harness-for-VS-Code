import * as vscode from "vscode";
import { join } from "node:path";
import { DshHub, type HubStatus } from "./dsh/hub";
import { createTranslator } from "./dsh/i18n";
import { registerChatParticipant } from "./dsh/chatParticipant";
import { folderCwd, setParticipantSession } from "./dsh/participantSessions";
import { registerCommitMessageCommand } from "./dsh/commitMessage";
import { ensureRollbackPluginInstalled } from "./dsh/rollbackInstall";
import { ChatPanelProvider } from "./webview/panel";
import { ChatWindowProvider } from "./webview/window";
import { CordisPanelProvider } from "./webview/cordisPanel";

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
  output.appendLine(`[activate] node ${process.version} · execPath ${process.execPath} · platform ${process.platform}`);
  output.appendLine(`[activate] PATH 条目:`);
  for (const entry of (process.env.PATH ?? "").split(";").filter(Boolean)) output.appendLine(`  ${entry}`);
  output.appendLine(
    `[activate] APPDATA=${process.env.APPDATA ?? "-"} LOCALAPPDATA=${process.env.LOCALAPPDATA ?? "-"} USERPROFILE=${process.env.USERPROFILE ?? "-"} TEMP=${process.env.TEMP ?? "-"}`,
  );
  output.appendLine(`[activate] 配置: url=${dshUrl()} autoStart=${cfg().get<boolean>("autoStart", true)} command=${cfg().get<string>("command", "dsh")} timeoutSec=${cfg().get<number>("autoStartTimeoutSec", 60)}`);
  let lastStatusKey = "";

  const hub = new DshHub({
    url: dshUrl(),
    command: cfg().get<string>("command", "dsh"),
    autoStart: cfg().get<boolean>("autoStart", true),
    autoStartTimeoutSec: cfg().get<number>("autoStartTimeoutSec", 60),
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

  // ---------- 回合级 Git 回退服务端插件:自动安装进用户的 DSH web profile ----------
  // 快照/回退命令(/rollback /redo /checkpoints)由服务端插件承担;扩展把编译好的插件
  // 打进 vsix 的 resources/dsh-git-rollback,激活时幂等安装(带版本标记),服务器下次启动生效。
  const bundledRollbackDir = join(ctx.extensionUri.fsPath, "resources", "dsh-git-rollback");
  const rollbackInstall = { checked: false };
  const installPromise = (async () => {
    if (!cfg().get<boolean>("installRollbackPlugin", true)) return;
    const result = await ensureRollbackPluginInstalled(bundledRollbackDir);
    output.appendLine(`[rollback-plugin] 安装结果: ${JSON.stringify(result)}`);
  })();

  // 服务器上线后:若插件文件已就位但运行中的服务器未加载(安装发生在服务器启动之后),提示一键重启
  const checkRollbackActive = async () => {
    if (rollbackInstall.checked || !cfg().get<boolean>("installRollbackPlugin", true)) return;
    rollbackInstall.checked = true;
    try {
      await installPromise;
      const sessionId = hub.store.listSessions()[0]?.sessionId;
      if (!sessionId) return; // 尚无会话可查命令目录;下次激活再检
      const { names } = await hub.client.listCommands(sessionId);
      // rollback 在 0.1.1 已有,undo 是 0.1.2 新增:两者都在才认为插件版本已生效,
      // 否则运行中的服务器仍是旧插件(升级后必须重启才加载新命令)
      if (names.includes("rollback") && names.includes("undo")) return; // 插件已生效
    } catch (error) {
      output.appendLine(`[rollback-plugin] 生效检测失败: ${String(error)}`);
      return;
    }
    const restart = t("rollback.pluginRestartNow");
    const pick = await vscode.window.showInformationMessage(t("rollback.pluginInstalledHint"), restart);
    if (pick !== restart) return;
    if (hub.server.status.startedByUs) {
      await hub.server.stop();
      const ready = await hub.ensureReady();
      output.appendLine(`[rollback-plugin] 重启结果: ${ready.ok ? "ok" : (ready.message ?? "failed")}`);
      void vscode.window.showInformationMessage(t("rollback.pluginRestarted"));
    } else {
      void vscode.window.showInformationMessage(t("rollback.pluginManualRestart"));
    }
  };
  hub.onStatus((status) => {
    if (status.serverUp && !rollbackInstall.checked) void checkRollbackActive();
  });

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
  const cordisPanel = new CordisPanelProvider(hub, ctx);

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
    vscode.commands.registerCommand("dsh.openCordisPanel", () => {
      cordisPanel.open();
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
      // 与网页端一致:归档会话与子代理会话不列入常规选择列表
      const sessions = hub.store
        .listSessions()
        .filter((s) => !hub.store.archivedSessionIds.has(s.sessionId) && s.origin !== "subagent");
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
        { placeHolder: t("msg.selectSessionPlaceholder") },
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
    vscode.commands.registerCommand("dsh.updateServer", async () => {
      // 升级本地直接安装的 DSH 服务器(@deepseek-ai/dsh@latest):新版本功能
      // (如 low 推理强度、rc.8 命令图文输入等)需要服务器端支持
      const confirm = t("server.updateConfirm");
      const pick = await vscode.window.showInformationMessage(
        `${t("server.updateHint", { version: hub.status.version ?? "?" })}\n${confirm}`,
        { modal: false },
        t("server.updateNow"),
      );
      if (pick !== t("server.updateNow")) return;
      if (hub.server.status.startedByUs) await hub.server.stop();
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t("server.updating"), cancellable: false },
        async () => {
          const ok = await hub.server.updateDirectInstall();
          if (!ok) {
            void vscode.window.showErrorMessage(t("server.updateFailed"));
            return;
          }
          const ready = await hub.ensureReady();
          void vscode.window.showInformationMessage(
            ready.ok ? t("server.updated") : t("server.updateRestartFailed", { message: ready.message ?? "" }),
          );
        },
      );
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
        `${t("info.vscodeVersion")}: ${vscode.version}`,
        `${t("info.activated")}: ${t("info.yes")}`,
        `${t("info.chatApi")}: ${chatApi ? t("info.chatApiYes") : t("info.chatApiNo")}`,
        `${t("info.server")}: ${dshUrl()} — ${hub.status.serverUp ? t("info.online") : t("info.offline")}`,
        `${t("info.stream")}: ${hub.status.muxConnected ? t("info.connected") : t("info.disconnected")}`,
        `${t("info.model")}: ${hub.status.model ?? "-"}`,
        `${t("info.sessions")}: ${hub.store.listSessions().length}`,
        `${t("info.cwd")}: ${folderCwd() ?? t("info.noFolder")}`,
        `${t("info.secondarySidebar")}: ${supportsSecondarySidebar ? t("info.secondaryYes") : t("info.secondaryNo")}`,
        "",
        t("info.swHint1"),
        t("info.swHint2"),
        t("info.swHint3"),
        t("info.swHint4"),
        t("info.swHint5"),
      ].join("\n");
      const openLabel = t("info.openBuiltInChat");
      void vscode.window.showInformationMessage(info, { modal: true }, openLabel).then((pick) => {
        if (pick === openLabel) void vscode.commands.executeCommand("dsh.openChat");
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
    // 源代码管理:自动生成提交信息
    registerCommitMessageCommand(hub, ctx),
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
    try {
      const ok = await hub.probe();
      output.appendLine(`[activate] 服务器探测结果: ${ok ? "在线" : "离线"}`);
      if (!ok) {
        if (cfg().get<boolean>("autoStart", true)) {
          output.appendLine("[activate] dsh.autoStart=true · 服务器离线,启动时自动启动…");
          const ensured = await hub.ensureReady();
          output.appendLine(`[activate] 启动时自动启动结果: ${ensured.ok ? "成功" : `失败 · ${ensured.message ?? "未知错误"}`}`);
          if (ensured.ok) return;
        }
        watchServer();
      }
    } catch (error) {
      output.appendLine(`[activate] 启动流程异常: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
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
