import { DshApiClient, DshApiError, type FrameEnvelope } from "./apiClient";
import { ServerManager } from "./serverManager";
import { SessionStore, type StoredSession } from "./sessionStore";
import type { HostFrame, MuxFrame } from "./types";

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
  /** 启动服务器时的工作目录(懒取值,通常返回 VS Code 当前打开的文件夹)。 */
  cwd?: () => string | undefined;
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
      { url: deps.url, command: deps.command, autoStart: deps.autoStart, timeoutSec: deps.autoStartTimeoutSec, cwd: deps.cwd, t: deps.t, onLog: deps.onLog },
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

  /** 仅探测(不自动启动):服务器在线时刷新会话并选中最近会话。 */
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
    if (!this.store.currentSessionId) {
      const latest = this.store.listSessions()[0];
      if (latest) this.store.selectSession(latest.sessionId);
    }
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
    // 默认选中最近会话(不自动加载历史,打开面板时再加载)
    if (!this.store.currentSessionId) {
      const latest = this.store.listSessions()[0];
      if (latest) this.store.selectSession(latest.sessionId);
    }
    return { ok: true };
  }

  /** 刷新会话列表(合并 host 帧之外的信息:标题、running、更新顺序)。 */
  async refreshSessions() {
    try {
      const { items } = await this.client.listSessions();
      let changed = false;
      for (const item of items) {
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
        if (context !== undefined) this.store.applyContext(item.sessionId, context);
        const permissions = item.projections?.values?.permissions;
        if (permissions !== undefined) this.store.applyPermissions(item.sessionId, permissions);
        const todos = item.projections?.values?.todos;
        if (todos !== undefined) this.store.applyTodos(item.sessionId, todos);
        const sessionStats = item.projections?.values?.sessionStats;
        const tokenUsage = item.projections?.values?.tokenUsage;
        if (sessionStats != null || tokenUsage != null) {
          const current = { ...(this.store.stats.get(item.sessionId) ?? {}) };
          if (sessionStats !== undefined) current.sessionStats = sessionStats;
          if (tokenUsage !== undefined) current.tokenUsage = tokenUsage;
          this.store.emitStats(item.sessionId, current);
        }
      }
      if (changed) {
        // 通知会话列表变化(通过伪造帧路径之外,直接派发)
        this.notifySessionsChanged();
      }
      return items;
    } catch (error) {
      console.error("[dsh] refreshSessions failed:", error);
      return [];
    }
  }

  private notifySessionsChanged() {
    this.store.notifySessionsChanged();
  }

  /** 已回填过历史的会话(实时流事件进 store 后,不再用 events 数量误判"已有历史")。 */
  private readonly historyLoaded = new Set<string>();

  /** 打开会话并回填历史。 */
  async openSession(sessionId: string) {
    this.store.selectSession(sessionId);
    await this.ensureHistory(sessionId);
  }

  /**
   * 回填会话历史:每个会话首次打开时拉一次(sessionHistory 与实时流事件按 seq 合并,只填缺口)。
   * 不能用 eventsFor().length 判断——mux 全局流会把其它入口(如 Web 端)会话的实时 chunk
   * 事件写进 store,若因此跳过加载,聊天区只剩过滤后的零星事件(表现为"看不到历史")。
   */
  async ensureHistory(sessionId: string) {
    if (this.historyLoaded.has(sessionId)) return;
    this.historyLoaded.add(sessionId);
    try {
      const { events, hasMore } = await this.client.sessionHistory({ sessionId, maxMessages: HISTORY_PAGE_MESSAGES });
      this.store.mergeHistory(sessionId, events.map((e) => ({ event: e.event, view: e.view })));
      this.store.historyHasMore.set(sessionId, hasMore);
    } catch (error) {
      // 失败允许下次重试
      this.historyLoaded.delete(sessionId);
      console.error("[dsh] history load failed:", error);
    }
  }

  /** 向前翻页加载更早的历史。 */
  async loadMoreHistory(sessionId: string): Promise<{ hasMore: boolean }> {
    if (this.store.isHistoryLoading(sessionId)) return { hasMore: true };
    const beforeSeq = this.store.historyBeforeSeq(sessionId);
    if (beforeSeq === undefined) {
      await this.ensureHistory(sessionId);
      return { hasMore: this.store.historyHasMore.get(sessionId) ?? false };
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

  /** 工作区列表(侧边栏按工作区分组会话)。 */
  listWorkspaces() {
    return this.client.listWorkspaces();
  }

  /**
   * 在当前 VS Code 文件夹下创建会话:先采纳该目录为工作区(幂等,
   * 以前打开过则进入已有分组,从未打开过则自动建立新分组),再创建会话。
   * 避免服务器回退到"上次会话目录"导致新对话进错工作区。
   */
  async createSessionForFolder(cwd?: string, agentPreset?: string): Promise<string> {
    if (cwd) await this.adoptWorkspace(cwd);
    return this.createSession(cwd, agentPreset);
  }

  async createSession(cwd?: string, agentPreset?: string): Promise<string> {
    const { sessionId } = await this.client.createSession({ ...(cwd ? { cwd } : {}), ...(agentPreset ? { agentPreset } : {}) });
    await this.refreshSessions();
    this.store.selectSession(sessionId);
    return sessionId;
  }

  /** 把目录采纳为 DSH 工作区(先确保服务器就绪;幂等,重复调用返回已存在的工作区)。 */
  async adoptWorkspace(path: string): Promise<boolean> {
    if (!path) return false;
    const ready = await this.ensureReady();
    if (!ready.ok) return false;
    try {
      await this.client.adoptWorkspace(path);
      return true;
    } catch (error) {
      this.deps.onLog?.(`[workspace] 采纳工作区失败 ${path}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async send(sessionId: string, text: string, mode: "queue" | "steer" = "queue") {
    try {
      await this.client.sendPrompt({ sessionId, mode, content: [{ type: "text", text }] });
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

  subagentHistory(sessionId: string, childSessionId: string, mode: "one-shot" | "continuable") {
    return this.client.subagentHistory(sessionId, childSessionId, mode);
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
