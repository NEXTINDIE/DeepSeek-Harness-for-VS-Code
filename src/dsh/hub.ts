import { DshApiClient, DshApiError, type FrameEnvelope } from "./apiClient";
import { ServerManager } from "./serverManager";
import { SessionStore, type StoredSession } from "./sessionStore";
import type { CommandExecutionView, HostFrame, MuxFrame, PromptContentPart } from "./types";

export interface HubStatus {
  serverUp: boolean;
  serverStartedByUs: boolean;
  serverStarting: boolean;
  muxConnected: boolean;
  hostConnected: boolean;
  version?: string;
  provider?: string;
  model?: string;
  message?: string;
}

export interface HubDeps {
  url: string;
  command: string;
  autoStart: boolean;
  autoStartTimeoutSec: number;
  /** 新建会话时自动应用的推理强度(思考深度);留空使用模型默认。 */
  defaultReasoningEffort?: string;
  onStatus?: (status: HubStatus) => void;
  onNotice?: (message: string, kind: "info" | "warning" | "error") => void;
  /** 诊断日志(启动器解析 / 服务器进程状态),由宿主输出到日志通道。 */
  onLog?: (message: string) => void;
  /** 翻译函数(vscode.l10n.t);hub 保持对 vscode 无依赖。 */
  t?: (key: string, args?: Record<string, string | number>) => string;
}

const HISTORY_PAGE_MESSAGES = 60;

/** 中枢:服务器 + API 客户端 + 会话存储的统一入口。 */
export class DshHub {
  readonly store = new SessionStore();
  readonly client: DshApiClient;
  readonly server: ServerManager;

  private statusState: HubStatus = {
    serverUp: false,
    serverStartedByUs: false,
    serverStarting: false,
    muxConnected: false,
    hostConnected: false,
  };

  private readyPromise: Promise<{ ok: boolean; message?: string }> | undefined;
  private hostInfoPromise: Promise<void> | undefined;
  private statusListeners = new Set<(status: HubStatus) => void>();

  constructor(private readonly deps: HubDeps) {
    this.client = new DshApiClient(deps.url);
    this.server = new ServerManager(
      { url: deps.url, command: deps.command, autoStart: deps.autoStart, timeoutSec: deps.autoStartTimeoutSec, t: deps.t, onLog: deps.onLog },
      (s) => {
        this.statusState.serverUp = s.up;
        this.statusState.serverStartedByUs = s.startedByUs;
        this.statusState.serverStarting = s.starting;
        this.statusState.message = s.message;
        this.emitStatus();
      },
    );
    this.client.setFrameHandlers({
      onMuxFrame: (env) => this.onMux(env),
      onHostFrame: (env) => this.onHost(env),
      onState: (which, state) => {
        if (which === "mux") this.statusState.muxConnected = state === "connected";
        else this.statusState.hostConnected = state === "connected";
        this.emitStatus();
      },
    });
  }

  get status(): HubStatus {
    return { ...this.statusState };
  }

  onStatus(listener: (status: HubStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus() {
    this.deps.onStatus?.({ ...this.statusState });
    for (const listener of this.statusListeners) {
      try {
        listener({ ...this.statusState });
      } catch (error) {
        console.error("[dsh] status listener threw:", error);
      }
    }
  }

  private onMux(env: FrameEnvelope<MuxFrame>) {
    this.store.handleMuxEnvelope(env);
  }

  private onHost(env: FrameEnvelope<HostFrame>) {
    this.store.handleHostFrame(env.frame);
  }

  /** 确保服务器 + 客户端 + 初始数据就绪(可并发调用,共享同一 Promise)。 */
  ensureReady(): Promise<{ ok: boolean; message?: string }> {
    if (!this.readyPromise) {
      this.readyPromise = this.doEnsureReady().finally(() => {
        this.readyPromise = undefined;
      });
    }
    return this.readyPromise;
  }

  /** 仅探测(不自动启动):服务器在线时刷新会话;不主动选中会话,由用户从下拉框选择。 */
  async probe(): Promise<boolean> {
    const describe = await this.client.ping();
    if (describe === undefined) {
      this.statusState.serverUp = false;
      this.emitStatus();
      return false;
    }
    this.statusState.serverUp = true;
    this.statusState.version = describe.version;
    this.statusState.provider = describe.provider;
    this.statusState.model = describe.model;
    this.emitStatus();
    await this.refreshSessions();
    return true;
  }

  private async doEnsureReady(): Promise<{ ok: boolean; message?: string }> {
    const ensured = await this.server.ensure();
    if (!ensured.up) {
      this.deps.onNotice?.(ensured.message ?? this.deps.t?.("hub.serverUnavailable") ?? "DSH server unavailable", "error");
      return { ok: false, message: ensured.message };
    }
    const describe = await this.client.ping();
    if (describe === undefined) {
      const msg = this.deps.t?.("hub.serverNoResponse", { url: this.deps.url }) ?? `DSH server at ${this.deps.url} is not responding`;
      this.deps.onNotice?.(msg, "error");
      return { ok: false, message: msg };
    }
    this.statusState.version = describe.version;
    this.statusState.provider = describe.provider;
    this.statusState.model = describe.model;
    this.emitStatus();
    await this.refreshSessions();
    return { ok: true };
  }

  /** 刷新会话列表(合并 host 帧之外的信息:标题、running、更新顺序)。 */
  async refreshSessions() {
    try {
      const [sessionList, workspaceList] = await Promise.all([
        this.client.listSessions(),
        this.client.listWorkspaces().catch(() => undefined),
      ]);
      if (workspaceList) {
        this.store.applyWorkspaceList(workspaceList.items, workspaceList.archivedSessionIds);
      }
      let changed = false;
      for (const item of sessionList.items) {
        const existing = this.store.sessions.get(item.sessionId);
        const next: StoredSession = {
          sessionId: item.sessionId,
          title: item.projections?.values?.title ?? existing?.title,
          running: item.running,
          blank: item.blank,
          cwd: item.cwd ?? existing?.cwd,
          agentPreset: item.agentPreset ?? existing?.agentPreset,
          parentSessionId: item.parentSessionId,
          origin: item.origin,
          updatedAt: item.updatedAt,
        };
        const prev = this.store.sessions.get(item.sessionId);
        if (!prev || prev.title !== next.title || prev.running !== next.running || prev.updatedAt !== next.updatedAt) {
          this.store.sessions.set(item.sessionId, next);
          changed = true;
        }
        const goal = item.projections?.values?.goal;
        if (goal !== undefined) this.store.applyGoal(item.sessionId, goal);
        const context = item.projections?.values?.contextPressure;
        if (context !== undefined) {
          this.store.context.set(item.sessionId, context as { pressureTokens?: number; projectedTokens?: number; contextWindow?: number });
        }
        const permissions = item.projections?.values?.permissions;
        if (permissions !== undefined) {
          this.store.permissions.set(item.sessionId, permissions as { options: { value: string; name: string }[]; currentValue: string });
        }
        const todos = item.projections?.values?.todos;
        if (todos !== undefined) {
          this.store.todos.set(item.sessionId, todos as { content: string; status: "pending" | "in_progress" | "completed" }[] | null);
        }
        const sessionStats = item.projections?.values?.sessionStats;
        const tokenUsage = item.projections?.values?.tokenUsage;
        if (sessionStats !== undefined || tokenUsage !== undefined) {
          const current = this.store.stats.get(item.sessionId) ?? {};
          if (sessionStats !== undefined) current.sessionStats = sessionStats;
          if (tokenUsage !== undefined) current.tokenUsage = tokenUsage;
          this.store.stats.set(item.sessionId, current);
        }
      }
      if (changed) {
        // 通知会话列表变化(通过伪造帧路径之外,直接派发)
        this.notifySessionsChanged();
      }
      return sessionList.items;
    } catch (error) {
      console.error("[dsh] refreshSessions failed:", error);
      return [];
    }
  }

  private notifySessionsChanged() {
    this.store.notifySessionsChanged();
  }

  /** 打开会话并回填历史。 */
  async openSession(sessionId: string) {
    this.store.selectSession(sessionId);
    await this.loadInitialHistory(sessionId);
  }

  private async loadInitialHistory(sessionId: string) {
    if (this.store.eventsFor(sessionId).length === 0) {
      try {
        const { events, hasMore } = await this.client.sessionHistory({ sessionId, maxMessages: HISTORY_PAGE_MESSAGES });
        this.store.mergeHistory(sessionId, events.map((e) => ({ event: e.event, view: e.view })));
        this.store.historyHasMore.set(sessionId, hasMore);
      } catch (error) {
        console.error("[dsh] history load failed:", error);
      }
    }
  }

  /** 向前翻页加载更早的历史。 */
  async loadMoreHistory(sessionId: string): Promise<{ hasMore: boolean }> {
    if (this.store.isHistoryLoading(sessionId)) return { hasMore: true };
    const beforeSeq = this.store.historyBeforeSeq(sessionId);
    if (beforeSeq === undefined) {
      await this.loadInitialHistory(sessionId);
      return { hasMore: false };
    }
    this.store.setHistoryLoading(sessionId, true);
    try {
      const { events, hasMore } = await this.client.sessionHistory({ sessionId, beforeSeq, maxMessages: HISTORY_PAGE_MESSAGES });
      this.store.mergeHistory(sessionId, events.map((e) => ({ event: e.event, view: e.view })));
      this.store.historyHasMore.set(sessionId, hasMore);
      return { hasMore };
    } catch (error) {
      console.error("[dsh] history page failed:", error);
      return { hasMore: true };
    } finally {
      this.store.setHistoryLoading(sessionId, false);
    }
  }

  async createSession(cwd?: string, agentPreset?: string): Promise<string> {
    // 服务器行为:仅当 session.create 携带 workspaceId 时,会话才会挂入对应工作区;
    // 只传 cwd 的话目录正确但会话落入"未分组"。因此先按 cwd 反查已注册工作区。
    const workspaceId = cwd ? await this.resolveWorkspaceId(cwd) : undefined;
    const { sessionId } = await this.client.createSession({
      ...(workspaceId ? { workspaceId } : cwd ? { cwd } : {}),
      ...(agentPreset ? { agentPreset } : {}),
    });
    await this.refreshSessions();
    this.store.selectSession(sessionId);
    return sessionId;
  }

  /** 按 cwd 路径解析已注册工作区;未注册时返回 undefined(回退按 cwd 创建)。 */
  async resolveWorkspaceId(cwd: string): Promise<string | undefined> {
    const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
    const target = norm(cwd);
    const local = this.store.listWorkspaces().find((w) => norm(w.path) === target);
    if (local) return local.workspaceId;
    // 本地工作区列表可能尚未加载:直接询问服务器
    try {
      const list = await this.client.listWorkspaces();
      const match = list.items.find((w) => norm(w.path) === target);
      if (match) {
        this.store.upsertWorkspace(match);
        return match.workspaceId;
      }
    } catch {
      // 忽略:按 cwd 创建,会话保持未分组(与网页端无对应工作区时一致)
    }
    return undefined;
  }

  async send(sessionId: string, text: string): Promise<{ accepted: true; command?: { kind: "success"; text?: string } } | undefined> {
    try {
      return await this.client.sendPrompt({ sessionId, mode: "queue", content: [{ type: "text", text }] });
    } catch (error) {
      const message = error instanceof DshApiError ? `${error.code}: ${error.message}` : String(error);
      this.deps.onNotice?.(this.deps.t?.("hub.sendFailed", { message }) ?? `Send failed: ${message}`, "error");
      throw error;
    }
  }

  /**
   * 执行一条斜杠命令(网页端 live.command() 同款语义):
   * 1. 优先 commands.execute 网关通道(纯命令执行,不产生模型回合);
   * 2. 网关不可用时回退 session.prompt 命令路径,并检查响应中的 command 槽确认宿主拦截;
   * 3. 若两者都未被宿主拦截(命令会进入模型),在会话空闲时立即取消该轮,避免模型收到命令文本。
   * 返回 outcome("executed" / "unmatched" / "unavailable")+ 命令结果视图
   * (execution.result.text 为命令自身的输出文本,如 /rollback 的回退摘要)。
   */
  async runCommandLine(
    sessionId: string,
    line: string,
  ): Promise<{ outcome: "executed" | "unmatched" | "unavailable"; execution?: CommandExecutionView }> {
    try {
      const result = await this.client.executeCommand(sessionId, line);
      return { outcome: result.matched ? "executed" : "unmatched", ...(result.execution ? { execution: result.execution } : {}) };
    } catch (error) {
      // 网关通道不可用(部署未组合 api-gateway / commands 远程):回退官方命令消息路径
      console.error("[dsh] commands.execute unavailable, falling back to session.prompt:", error);
    }
    const wasRunning = this.store.sessions.get(sessionId)?.running === true;
    try {
      const res = await this.client.sendPrompt({ sessionId, mode: "queue", content: [{ type: "text", text: line }] });
      if (res.command !== undefined) return { outcome: "executed" };
      // 宿主未拦截:命令文本会进入模型。会话原本空闲时立即取消该轮,避免产生可见回复
      if (!wasRunning) await this.client.cancelSession(sessionId);
      return { outcome: "unavailable" };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  /** 宿主命令名缓存(sessionId → 名称集合),供 /token 路由判定:命令走命令通道,技能 token 走普通 prompt。 */
  private readonly commandNames = new Map<string, Set<string>>();

  /** 判断一个(不带斜杠的)名称是否为宿主命令。 */
  async isKnownCommand(sessionId: string, name: string): Promise<boolean> {
    const lower = name.toLowerCase();
    let set = this.commandNames.get(sessionId);
    if (!set) {
      try {
        const names = await this.client.listCommands(sessionId);
        set = new Set(names.map((n) => n.toLowerCase()));
        this.commandNames.set(sessionId, set);
      } catch (error) {
        console.error("[dsh] commands/list failed:", error);
        // 无法确认时保守视为命令:走命令通道,失败会取消回合并提示,不会误发给模型
        return true;
      }
    }
    return set.has(lower);
  }

  /** 清空命令名缓存(连接重建时调用)。 */
  clearCommandCache() {
    this.commandNames.clear();
  }

  /** 发送带内容块的消息(文本 + 图片)。 */
  async sendParts(sessionId: string, content: PromptContentPart[]) {
    try {
      await this.client.sendPromptParts(sessionId, "queue", content);
    } catch (error) {
      const message = error instanceof DshApiError ? `${error.code}: ${error.message}` : String(error);
      this.deps.onNotice?.(this.deps.t?.("hub.sendFailed", { message }) ?? `Send failed: ${message}`, "error");
      throw error;
    }
  }

  async cancel(sessionId: string) {
    try {
      await this.client.cancelSession(sessionId);
    } catch (error) {
      console.error("[dsh] cancel failed:", error);
    }
  }

  async respondApproval(sessionId: string, approvalId: string, outcome: "allowed-once" | "rejected") {
    const pending = this.store.pendingApprovals.get(approvalId);
    if (!pending) {
      this.deps.onNotice?.(this.deps.t?.("hub.approvalGone") ?? "The approval is no longer pending", "warning");
      return;
    }
    try {
      await this.client.respondApproval(sessionId, approvalId, outcome, pending.frameRpcId);
      this.store.pendingApprovals.delete(approvalId);
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.approvalFailed", { error: String(error) }) ?? `Respond to approval failed: ${String(error)}`, "error");
    }
  }

  async respondQuestion(sessionId: string, frameRpcId: string, answers: { id: string; selected: string[]; custom?: string }[]) {
    const pending = this.store.pendingQuestions.get(frameRpcId);
    if (!pending) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionGone") ?? "The question is no longer pending", "warning");
      return;
    }
    try {
      await this.client.respondQuestion(sessionId, { answers }, frameRpcId);
      this.store.pendingQuestions.delete(frameRpcId);
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionFailed", { error: String(error) }) ?? `Answer question failed: ${String(error)}`, "error");
    }
  }

  /** 取消提问/计划审批(网页端 pending.cancel:错误信封 code=cancelled)。 */
  async cancelQuestion(_sessionId: string, frameRpcId: string) {
    try {
      await this.client.cancelQuestion(frameRpcId);
      this.store.pendingQuestions.delete(frameRpcId);
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionFailed", { error: String(error) }) ?? `Cancel question failed: ${String(error)}`, "error");
    }
  }

  // ---------- 模型 / 预设 / 思考深度 ----------

  getSessionModels(sessionId: string) {
    return this.client.sessionModels(sessionId);
  }

  /** 读取会话当前模型并同步到状态栏(host.describe 只提供默认模型)。 */
  async updateCurrentModel(sessionId: string) {
    try {
      const models = await this.client.sessionModels(sessionId);
      this.statusState.model = models.current.model;
      this.statusState.provider = models.current.provider;
      this.emitStatus();
    } catch {
      // 忽略:状态栏保持原值
    }
  }

  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string) {
    return this.client.selectModel(sessionId, provider, model, reasoningEffort);
  }

  listPresets() {
    return this.client.listAgentPresets();
  }

  async selectPreset(sessionId: string, agentPreset: string) {
    const result = await this.client.selectAgentPreset(sessionId, agentPreset);
    await this.refreshSessions();
    return result;
  }

  // ---------- 会话管理:重命名 / 分叉 / 归档 ----------

  renameSession(sessionId: string, title: string) {
    return this.client.renameSession(sessionId, title);
  }

  async forkSession(sessionId: string, atSeq?: number): Promise<string> {
    const { sessionId: forked } = await this.client.forkSession(sessionId, atSeq);
    await this.refreshSessions();
    return forked;
  }

  async archiveSession(sessionId: string) {
    const result = await this.client.archiveSession(sessionId);
    await this.refreshSessions();
    return result;
  }

  // ---------- goal ----------

  async createGoal(sessionId: string, objective: string, maxGoalRounds?: number) {
    const result = await this.client.goalCreate(sessionId, objective, maxGoalRounds);
    await this.refreshSessions();
    return result;
  }

  async completeGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalComplete(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async editGoal(sessionId: string, ref: { id: string; revision: number }, objective?: string) {
    const result = await this.client.goalEdit(sessionId, ref, objective);
    await this.refreshSessions();
    return result;
  }

  async resumeGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalResume(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async pauseGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalPause(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async clearGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalClear(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  // ---------- 技能 / 子代理 ----------

  getSkills(sessionId: string) {
    return this.client.listSkills(sessionId);
  }

  listSubagents(sessionId: string) {
    return this.client.listSubagents(sessionId);
  }

  subagentHistory(sessionId: string, childSessionId: string, mode: "one-shot" | "continuable", beforeSeq?: number, maxMessages?: number) {
    return this.client.subagentHistory(sessionId, childSessionId, mode, beforeSeq, maxMessages);
  }

  subagentPrompt(parentSessionId: string, childSessionId: string, text: string) {
    return this.client.subagentPrompt(parentSessionId, childSessionId, text);
  }

  subagentInterrupt(parentSessionId: string, childSessionId: string) {
    return this.client.subagentInterrupt(parentSessionId, childSessionId);
  }

  // ---------- 工作区 ----------

  listWorkspaces() {
    return this.client.listWorkspaces();
  }

  async refreshWorkspaces() {
    try {
      const list = await this.client.listWorkspaces();
      this.store.applyWorkspaceList(list.items, list.archivedSessionIds);
      return list;
    } catch (error) {
      console.error("[dsh] refreshWorkspaces failed:", error);
      return undefined;
    }
  }

  createWorkspace(path: string) {
    return this.client.createWorkspace(path);
  }
  renameWorkspace(workspaceId: string, title: string) {
    return this.client.renameWorkspace(workspaceId, title);
  }
  deleteWorkspace(workspaceId: string) {
    return this.client.deleteWorkspace(workspaceId);
  }
  moveWorkspace(workspaceId: string, beforeWorkspaceId?: string) {
    return this.client.moveWorkspace(workspaceId, beforeWorkspaceId);
  }
  moveSessionInWorkspace(workspaceId: string, sessionId: string, beforeSessionId?: string) {
    return this.client.moveSessionInWorkspace(workspaceId, sessionId, beforeSessionId);
  }

  // ---------- 会话搜索 / 图片附件 ----------

  searchSessions(query: string) {
    return this.client.searchSessions(query);
  }

  readAttachment(sessionId: string, attachmentId: string) {
    return this.client.readAttachment(sessionId, attachmentId);
  }

  // ---------- 预设作者 ----------

  readPreset(agentPreset: string) {
    return this.client.readAgentPreset(agentPreset);
  }
  copyPreset(from: string, agentPreset: string, name?: string) {
    return this.client.copyAgentPreset(from, agentPreset, name);
  }
  openPresetDocument(agentPreset: string) {
    return this.client.openAgentPresetDocument(agentPreset);
  }
  removePreset(agentPreset: string) {
    return this.client.removeAgentPreset(agentPreset);
  }

  // ---------- 设置 / 凭据 / LLM ----------

  settingsDescribe() {
    return this.client.settingsDescribe();
  }
  settingsOpenDocument() {
    return this.client.settingsOpenDocument();
  }
  settingsUpdate(ns: string, patch: object, expectedRevision?: number) {
    return this.client.settingsUpdate(ns, patch, expectedRevision);
  }
  settingsReplace(ns: string, section: object, expectedRevision?: number) {
    return this.client.settingsReplace(ns, section, expectedRevision);
  }
  settingsMutate(ns: string, ops: Parameters<DshApiClient["settingsMutate"]>[1], expectedRevision?: number) {
    return this.client.settingsMutate(ns, ops, expectedRevision);
  }
  credentialsDescribe(refs: string[]) {
    return this.client.credentialsDescribe(refs);
  }
  credentialsSet(ref: string, value: string) {
    return this.client.credentialsSet(ref, value);
  }
  credentialsUnset(ref: string) {
    return this.client.credentialsUnset(ref);
  }
  llmProviders() {
    return this.client.llmProviders();
  }
  llmModels() {
    return this.client.llmModels();
  }
  llmDiscoverModels(payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }) {
    return this.client.llmDiscoverModels(payload);
  }

  /** 新建会话后,若配置了默认思考深度且当前模型支持,则自动应用。 */
  async applyDefaultReasoningEffort(sessionId: string): Promise<void> {
    const configured = this.deps.defaultReasoningEffort?.trim();
    if (!configured) return;
    try {
      const models = await this.client.sessionModels(sessionId);
      const group = models.groups.find((g) => g.id === models.current.provider);
      const model = group?.models.find((m) => m.id === models.current.model);
      if (model?.reasoning?.efforts.some((e) => e.id === configured)) {
        await this.client.selectModel(sessionId, models.current.provider, models.current.model, configured);
      }
    } catch (error) {
      console.error("[dsh] applyDefaultReasoningEffort failed:", error);
    }
  }

  /** 等待会话空闲下来(以 turn/end 或非运行态为准),用于参与者。 */
  waitIdle(sessionId: string, token?: { isCancellationRequested: boolean; onCancellationRequested(cb: () => void): { dispose(): void } }): Promise<void> {
    return new Promise((resolve) => {
      const dispose: (() => void)[] = [];
      const finish = () => {
        for (const d of dispose) d();
        resolve();
      };
      dispose.push(
        this.store.on("turnEnd", (sid: string) => {
          if (sid === sessionId) finish();
        }),
        this.store.on("agentError", (sid: string) => {
          if (sid === sessionId) finish();
        }),
      );
      if (token) {
        const disposable = token.onCancellationRequested(() => finish());
        dispose.push(() => disposable.dispose());
      }
      // 兜底:若会话本就不在运行(例如 prompt 被拒绝或只是排队指令),延迟确认后返回
      const current = this.store.sessions.get(sessionId);
      if (current && !current.running) {
        setTimeout(() => {
          const s = this.store.sessions.get(sessionId);
          if (s && !s.running) finish();
        }, 1500);
      }
    });
  }

  dispose() {
    this.client.dispose();
  }
}
