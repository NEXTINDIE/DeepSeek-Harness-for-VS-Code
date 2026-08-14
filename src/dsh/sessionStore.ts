import type {
  AskUserQuestionItem,
  HostFrame,
  JobView,
  MuxFrame,
  QueueItem,
  SessionEvent,
  SessionSummary,
  ToolEventView,
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
  on(name: "currentChanged", fn: (sessionId: string | undefined) => void): () => void;
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
  /** session.list 刷新写入统计后通知订阅者(触发 webview 实时渲染)。 */
  emitStats(sessionId: string, value: unknown) {
    this.emit("stats", sessionId, value);
  }

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
    } else if (frame.type === "approval/resolved") {
      this.pendingApprovals.delete(frame.approvalId);
      this.emit("approvalResolved", frame.approvalId, frame.outcome);
    } else if (frame.type === "question/requested") {
      this.pendingQuestions.set(rpcId, { sessionId: frame.sessionId, frameRpcId: rpcId, questions: frame.questions });
      this.emit("question", this.pendingQuestions.get(rpcId));
    } else if (frame.type === "question/resolved") {
      this.pendingQuestions.delete(frame.questionRpcId);
      this.emit("questionResolved", frame.questionRpcId);
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
      case "host/workspace-changed":
      case "host/workspace-removed":
      case "host/workspace-order-changed":
      case "host/archived-sessions-changed":
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
          s.running = false;
          this.emit("running", sessionId, false);
        }
        this.lastTurnBySession.set(sessionId, event.data?.turn ?? 0);
        this.emit("turnEnd", sessionId, event.data?.turn ?? 0);
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
      // 空投影(null/undefined)不覆盖已有统计(回合开始时的重置帧不应清空界面)
      if (value == null) return;
      const current = this.stats.get(sessionId) ?? {};
      current[key === "sessionStats" ? "sessionStats" : "tokenUsage"] = value;
      this.stats.set(sessionId, current);
      // 发送合并后的完整统计,避免 webview 用部分值互相覆盖
      this.emit("stats", sessionId, current);
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
    this.goals.clear();
    this.context.clear();
    this.permissions.clear();
    this.stats.clear();
    this.todos.clear();
    this.historyHasMore.clear();
    this.currentSessionId = undefined;
  }
}
