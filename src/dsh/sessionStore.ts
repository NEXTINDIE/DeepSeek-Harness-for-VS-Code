import type {
  AskUserQuestionItem,
  HostFrame,
  JobView,
  MuxFrame,
  QueueItem,
  SessionEvent,
  SessionSummary,
  ToolEventView,
  WorkspaceItem,
} from "./types";

export interface StoredSession {
  sessionId: string;
  title?: string;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  parentSessionId?: string;
  origin?: "subagent";
  updatedAt: number;
  /** 有未查看完成的回合(会话列表显示绿点,点击会话后清除) */
  unread?: boolean;
}

export interface PendingApproval {
  sessionId: string;
  approvalId: string;
  toolName: string;
  callId?: string;
  reason?: string;
  frameRpcId: string;
}

export interface PendingQuestion {
  sessionId: string;
  frameRpcId: string;
  questions: AskUserQuestionItem[];
}

export interface StoredEvent {
  event: SessionEvent;
  view?: ToolEventView;
}

type Listener = (...args: any[]) => void;

/**
 * 会话与事件的进程内存储:消费 mux/host 帧,向 UI/参与者分发增量。
 * 事件按 seq 去重;历史通过 session.history 回填。
 */
export class SessionStore {
  readonly sessions = new Map<string, StoredSession>();
  /** sessionId → seq → event */
  readonly events = new Map<string, Map<number, StoredEvent>>();
  readonly maxSeq = new Map<string, number>();
  readonly pendingApprovals = new Map<string, PendingApproval>(); // key: approvalId
  readonly pendingQuestions = new Map<string, PendingQuestion>(); // key: frameRpcId
  readonly queues = new Map<string, QueueItem[]>();
  readonly jobs = new Map<string, JobView[]>();
  /** 工作区(workspace.list 基线 + host/workspace-changed 帧) */
  readonly workspaces = new Map<string, WorkspaceItem>();
  /** 工作区显示顺序(host/workspace-order-changed / workspace.list) */
  workspaceOrder: string[] = [];
  /** 全局归档会话集合(host/archived-sessions-changed / workspace.list) */
  readonly archivedSessionIds = new Set<string>();
  /** 会话的目标状态(session.list / session/projection 帧的 goal 投影) */
  readonly goals = new Map<string, unknown>();
  /** 上下文压力(contextPressure 投影) */
  readonly context = new Map<string, { pressureTokens?: number; projectedTokens?: number; contextWindow?: number }>();
  /** 权限预设(permissions 投影) */
  readonly permissions = new Map<string, { options: { value: string; name: string; description?: string }[]; currentValue: string }>();
  /** 会话统计(sessionStats / tokenUsage 投影) */
  readonly stats = new Map<string, { sessionStats?: unknown; tokenUsage?: unknown }>();
  /** 待办事项(todos 投影,每回合重置) */
  readonly todos = new Map<string, { content: string; status: "pending" | "in_progress" | "completed" }[] | null>();
  /** 每个会话是否还有更早的历史可加载(session.history 分页) */
  readonly historyHasMore = new Map<string, boolean>();
  /** 最近活跃会话(用于面板默认选择) */
  currentSessionId: string | undefined;
  lastTurnBySession = new Map<string, number>();
  /** 有未查看完成的回合的会话(绿点,与网页端一致:回合结束时非当前会话标记,点击后清除) */
  readonly unreadSessionIds = new Set<string>();

  private listeners = new Map<string, Set<Listener>>();
  private historyLoading = new Set<string>();

  // ---------- 事件订阅 ----------

  on(name: "sessionEvent", fn: (sessionId: string, stored: StoredEvent) => void): () => void;
  on(name: "sessionsChanged", fn: (sessions: StoredSession[]) => void): () => void;
  on(name: "approval", fn: (approval: PendingApproval) => void): () => void;
  on(name: "approvalResolved", fn: (approvalId: string, outcome: string) => void): () => void;
  on(name: "question", fn: (question: PendingQuestion) => void): () => void;
  on(name: "questionResolved", fn: (frameRpcId: string) => void): () => void;
  on(name: "queue", fn: (sessionId: string, items: QueueItem[]) => void): () => void;
  on(name: "running", fn: (sessionId: string, running: boolean) => void): () => void;
  on(name: "turnEnd", fn: (sessionId: string, turn: number) => void): () => void;
  on(name: "agentError", fn: (sessionId: string, message: string) => void): () => void;
  on(name: "goal", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "context", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "permissions", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "stats", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "todos", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "jobs", fn: (sessionId: string, jobs: JobView[]) => void): () => void;
  on(name: "workspaces", fn: () => void): () => void;
  on(name: "currentChanged", fn: (sessionId: string | undefined) => void): () => void;
  on(name: "remoteEvent", fn: (event: string, args: unknown[]) => void): () => void;
  on(name: string, fn: Listener): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  private emit(name: string, ...args: any[]) {
    for (const fn of this.listeners.get(name) ?? []) {
      try {
        fn(...args);
      } catch (error) {
        console.error(`[dsh] listener for "${name}" threw:`, error);
      }
    }
  }

  /** 通知会话列表已变化(供外部刷新调用)。 */
  notifySessionsChanged() {
    this.emit("sessionsChanged", this.listSessions());
  }

  // ---------- 帧消费 ----------

  handleMuxFrame(frame: MuxFrame) {
    switch (frame.type) {
      case "session/event":
        this.addEvent(frame.sessionId, frame.event, frame.view);
        break;
      case "session/subscribed":
        if (!this.maxSeq.has(frame.sessionId)) this.maxSeq.set(frame.sessionId, frame.lastSeq);
        break;
      case "approval/requested":
        this.pendingApprovals.set(frame.approvalId, { ...frame, frameRpcId: "" } as PendingApproval);
        break;
      case "approval/resolved":
        this.pendingApprovals.delete(frame.approvalId);
        this.emit("approvalResolved", frame.approvalId);
        break;
      case "question/requested":
        this.pendingQuestions.set("", { sessionId: frame.sessionId, frameRpcId: "", questions: frame.questions });
        break;
      case "question/resolved":
        this.pendingQuestions.delete(frame.questionRpcId);
        this.emit("questionResolved", frame.questionRpcId);
        break;
      case "session/queue":
        this.queues.set(frame.sessionId, frame.items);
        this.emit("queue", frame.sessionId, frame.items);
        break;
      case "session/jobs":
        this.jobs.set(frame.sessionId, frame.jobs);
        this.emit("jobs", frame.sessionId, frame.jobs);
        break;
      case "session/projection":
        this.applyProjection(frame.sessionId, frame.key, frame.value);
        break;
      case "stream/error":
        console.error("[dsh] mux stream error:", frame.error);
        break;
    }
  }

  /** 携带 rpcId 的帧入口(approval/question 需要 frameRpcId 来回应)。 */
  handleMuxEnvelope(env: { rpcId: string; frame: MuxFrame }) {
    const { rpcId, frame } = env;
    if (frame.type === "approval/requested") {
      this.pendingApprovals.set(frame.approvalId, { ...frame, frameRpcId: rpcId });
      this.emit("approval", this.pendingApprovals.get(frame.approvalId));
      this.emit("sessionsChanged", this.listSessions());
    } else if (frame.type === "approval/resolved") {
      this.pendingApprovals.delete(frame.approvalId);
      this.emit("approvalResolved", frame.approvalId, frame.outcome);
      this.emit("sessionsChanged", this.listSessions());
    } else if (frame.type === "question/requested") {
      this.pendingQuestions.set(rpcId, { sessionId: frame.sessionId, frameRpcId: rpcId, questions: frame.questions });
      this.emit("question", this.pendingQuestions.get(rpcId));
      this.emit("sessionsChanged", this.listSessions());
    } else if (frame.type === "question/resolved") {
      this.pendingQuestions.delete(frame.questionRpcId);
      this.emit("questionResolved", frame.questionRpcId);
      this.emit("sessionsChanged", this.listSessions());
    } else {
      this.handleMuxFrame(frame);
    }
  }

  handleHostFrame(frame: HostFrame) {
    switch (frame.type) {
      case "host/session-added": {
        const existing = this.sessions.get(frame.sessionId);
        if (!existing) {
          this.sessions.set(frame.sessionId, {
            sessionId: frame.sessionId,
            running: false,
            blank: frame.blank,
            cwd: frame.cwd,
            agentPreset: frame.agentPreset,
            parentSessionId: frame.parentSessionId,
            origin: frame.origin,
            updatedAt: Date.now(),
          });
          this.emit("sessionsChanged", this.listSessions());
        }
        break;
      }
      case "host/session-removed":
        this.sessions.delete(frame.sessionId);
        this.emit("sessionsChanged", this.listSessions());
        break;
      case "host/session-status": {
        const s = this.sessions.get(frame.sessionId);
        if (s) {
          s.running = frame.running;
          this.emit("running", frame.sessionId, frame.running);
        }
        break;
      }
      case "host/agent-error": {
        const s = this.sessions.get(frame.sessionId);
        if (s) s.running = false;
        this.emit("agentError", frame.sessionId, frame.message);
        break;
      }
      case "host/remote-event":
        // 宿主远程事件转发(网页端 ctx.remote.$on 同款):
        // cordis/request-run、cordis/request-run-resolved、cordis/dynamic-package、
        // cordis/dynamic-retract 等,args 为位置参数数组
        this.emit("remoteEvent", frame.event, frame.args);
        break;
      case "host/workspace-changed": {
        this.upsertWorkspace(frame.workspace);
        this.emit("workspaces");
        break;
      }
      case "host/workspace-removed":
        this.workspaces.delete(frame.workspaceId);
        this.workspaceOrder = this.workspaceOrder.filter((id) => id !== frame.workspaceId);
        this.emit("workspaces");
        break;
      case "host/workspace-order-changed":
        this.workspaceOrder = frame.workspaceIds;
        this.emit("workspaces");
        break;
      case "host/archived-sessions-changed":
        this.archivedSessionIds.clear();
        for (const id of frame.archivedSessionIds) this.archivedSessionIds.add(id);
        this.emit("workspaces");
        break;
      case "stream/error":
        console.error("[dsh] host stream error:", frame.error);
        break;
    }
  }

  // ---------- 事件存储 ----------

  private addEvent(sessionId: string, event: SessionEvent, view?: ToolEventView) {
    let bySeq = this.events.get(sessionId);
    if (!bySeq) this.events.set(sessionId, (bySeq = new Map()));
    const prevMax = this.maxSeq.get(sessionId) ?? -1;
    if (bySeq.has(event.seq)) return;
    bySeq.set(event.seq, { event, view });
    if (event.seq > prevMax) this.maxSeq.set(sessionId, event.seq);

    const stored: StoredEvent = { event, view };
    this.emit("sessionEvent", sessionId, stored);

    const s = this.sessions.get(sessionId);
    if (s) s.updatedAt = event.time;

    switch (event.type) {
      case "turn/start":
        if (s) {
          s.running = true;
          this.emit("running", sessionId, true);
        }
        break;
      case "turn/end":
        if (s) {
          // 回合结束但排队区仍有待处理消息时,宿主 agent 阶段保持 running
          // (turn() 返回 true 直接进入下一回合,不会置 idle)—— 与 agent.status 语义一致。
          // 只有队列清空才真正空闲(取消/出错/维护后也可能出现"空闲但仍有排队项",
          // 此时 running 由 host/session-status 帧置 false)。
          const stillPending = (this.queues.get(sessionId) ?? []).length > 0;
          s.running = stillPending;
          this.emit("running", sessionId, stillPending);
        }
        this.lastTurnBySession.set(sessionId, event.data?.turn ?? 0);
        this.emit("turnEnd", sessionId, event.data?.turn ?? 0);
        // 回合完成时若用户未在查看该会话,标记未读(绿点);查看(选中)时清除
        if (sessionId !== this.currentSessionId) {
          this.unreadSessionIds.add(sessionId);
          this.emit("sessionsChanged", this.listSessions());
        }
        break;
      case "user/message":
        if (!s?.blank && !this.currentSessionId) this.currentSessionId = sessionId;
        break;
    }
  }

  private applyProjection(sessionId: string, key: string, value: unknown) {
    const s = this.sessions.get(sessionId);
    if (key === "title" && typeof value === "string" && value) {
      if (s) {
        s.title = value;
        this.emit("sessionsChanged", this.listSessions());
      }
      return;
    }
    if (key === "goal") {
      this.applyGoal(sessionId, value);
      return;
    }
    if (key === "contextPressure") {
      this.context.set(sessionId, value as { pressureTokens?: number; projectedTokens?: number; contextWindow?: number });
      this.emit("context", sessionId, value);
      return;
    }
    if (key === "permissions") {
      this.permissions.set(sessionId, value as { options: { value: string; name: string }[]; currentValue: string });
      this.emit("permissions", sessionId, value);
      return;
    }
    if (key === "sessionStats" || key === "tokenUsage") {
      const current = this.stats.get(sessionId) ?? {};
      current[key === "sessionStats" ? "sessionStats" : "tokenUsage"] = value;
      this.stats.set(sessionId, current);
      this.emit("stats", sessionId, value);
      return;
    }
    if (key === "todos") {
      this.todos.set(sessionId, value as { content: string; status: "pending" | "in_progress" | "completed" }[] | null);
      this.emit("todos", sessionId, value);
    }
  }

  /** 记录会话的 goal 投影并通知。 */
  applyGoal(sessionId: string, value: unknown) {
    this.goals.set(sessionId, value);
    this.emit("goal", sessionId, value);
  }

  // ---------- 查询 ----------

  /** 合并一条工作区记录(帧或列表基线)。 */
  upsertWorkspace(workspace: WorkspaceItem) {
    const prev = this.workspaces.get(workspace.workspaceId);
    this.workspaces.set(workspace.workspaceId, workspace);
    if (prev === undefined && !this.workspaceOrder.includes(workspace.workspaceId)) {
      this.workspaceOrder.push(workspace.workspaceId);
    }
  }

  /** 应用 workspace.list 基线(顺序 + 归档集合)。 */
  applyWorkspaceList(items: WorkspaceItem[], archivedSessionIds: string[]) {
    for (const item of items) this.upsertWorkspace(item);
    // 服务器顺序只在前端尚无顺序信息时整体覆盖(帧增量优先)
    if (this.workspaceOrder.length === 0) {
      this.workspaceOrder = items.map((w) => w.workspaceId);
    }
    this.archivedSessionIds.clear();
    for (const id of archivedSessionIds) this.archivedSessionIds.add(id);
    this.emit("workspaces");
  }

  /** 按显示顺序返回工作区列表(未知 id 兜底)。 */
  listWorkspaces(): WorkspaceItem[] {
    const seen = new Set<string>();
    const out: WorkspaceItem[] = [];
    for (const id of this.workspaceOrder) {
      const w = this.workspaces.get(id);
      if (w && !seen.has(id)) {
        out.push(w);
        seen.add(id);
      }
    }
    for (const w of this.workspaces.values()) {
      if (!seen.has(w.workspaceId)) {
        out.push(w);
        seen.add(w.workspaceId);
      }
    }
    return out;
  }

  /** 会话当前等待的用户交互(审批 / 提问 / 计划审批),与网页端会话行状态一致。 */
  pendingFor(sessionId: string): { kind: "approval" | "question" | "plan-review" } | undefined {
    for (const approval of this.pendingApprovals.values()) {
      if (approval.sessionId === sessionId) return { kind: "approval" };
    }
    for (const question of this.pendingQuestions.values()) {
      if (question.sessionId !== sessionId) continue;
      const planReview = question.questions.some((q) => {
        const intent = (q as { intent?: unknown }).intent as { kind?: string } | undefined;
        return intent?.kind === "plan-review";
      });
      return { kind: planReview ? "plan-review" : "question" };
    }
    return undefined;
  }

  listSessions(): StoredSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  eventsFor(sessionId: string): StoredEvent[] {
    const bySeq = this.events.get(sessionId);
    if (!bySeq) return [];
    return [...bySeq.values()].sort((a, b) => a.event.seq - b.event.seq);
  }

  /** 合并历史事件(仅填充缺口)。 */
  mergeHistory(sessionId: string, stored: StoredEvent[]) {
    let bySeq = this.events.get(sessionId);
    if (!bySeq) this.events.set(sessionId, (bySeq = new Map()));
    let max = this.maxSeq.get(sessionId) ?? -1;
    let added = 0;
    for (const item of stored) {
      if (bySeq.has(item.event.seq)) continue;
      bySeq.set(item.event.seq, item);
      if (item.event.seq > max) max = item.event.seq;
      added++;
    }
    this.maxSeq.set(sessionId, max);
    return added;
  }

  /** 获取下一个回填起点(最老的已知 seq;未知则 undefined)。 */
  historyBeforeSeq(sessionId: string): number | undefined {
    const bySeq = this.events.get(sessionId);
    if (!bySeq || bySeq.size === 0) return undefined;
    return Math.min(...bySeq.keys());
  }

  isHistoryLoading(sessionId: string): boolean {
    return this.historyLoading.has(sessionId);
  }

  setHistoryLoading(sessionId: string, loading: boolean) {
    if (loading) this.historyLoading.add(sessionId);
    else this.historyLoading.delete(sessionId);
  }

  selectSession(sessionId: string | undefined) {
    this.currentSessionId = sessionId;
    // 查看会话 = 消除未读绿点
    if (sessionId !== undefined && this.unreadSessionIds.delete(sessionId)) {
      this.emit("sessionsChanged", this.listSessions());
    }
    this.emit("currentChanged", sessionId);
  }

  clear() {
    this.sessions.clear();
    this.events.clear();
    this.maxSeq.clear();
    this.pendingApprovals.clear();
    this.pendingQuestions.clear();
    this.queues.clear();
    this.jobs.clear();
    this.workspaces.clear();
    this.workspaceOrder = [];
    this.archivedSessionIds.clear();
    this.goals.clear();
    this.context.clear();
    this.permissions.clear();
    this.stats.clear();
    this.todos.clear();
    this.historyHasMore.clear();
    this.unreadSessionIds.clear();
    this.currentSessionId = undefined;
  }
}
