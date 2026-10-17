import type {
  AskUserQuestionItem,
  AssistantStreamFrame,
  JobRegisteredData,
  JobSettledData,
  JobView,
  MessageFeedbackItem,
  QueueItem,
  SessionControlFrame,
  SessionEvent,
  SessionFollowFrame,
  SessionHistoryRecord,
  SessionSummary,
  ToolEventView,
  UserQuestionProjection,
  PlanProjection,
  WorkspaceFollowFrame,
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
  /** $events 的 waterfall eventId(回答时作为 frameRpcId 回传)。 */
  frameRpcId: string;
}

export interface PendingQuestion {
  sessionId: string;
  frameRpcId: string;
  questions: AskUserQuestionItem[];
  /** 0.2.0 异步问答:限时提问对应的工具调用 id(作答走 userQuestions/answer)。 */
  callId?: string;
  /** 该提问是否为限时等待(等待到期后 Agent 可继续独立工作)。 */
  timed?: boolean;
  /** 剩余等待毫秒(等待流下发;到期后清空)。 */
  remainingMs?: number;
  /** 等待已到期(卡片保留,用户仍可稍后作答)。 */
  waited?: boolean;
}

export interface StoredEvent {
  event: SessionEvent;
  view?: ToolEventView;
}

type Listener = (...args: any[]) => void;

/**
 * 会话与事件的进程内存储:消费 0.1.2 的 session/follow、session/control、
 * workspace/follow 与 $events 帧,向 UI/参与者分发增量。
 * 事件按 seq 去重;历史通过 session/page 回填。
 */
export class SessionStore {
  readonly sessions = new Map<string, StoredSession>();
  /** sessionId → seq → event */
  readonly events = new Map<string, Map<number, StoredEvent>>();
  readonly maxSeq = new Map<string, number>();
  readonly pendingApprovals = new Map<string, PendingApproval>(); // key: approvalId(=eventId)
  readonly pendingQuestions = new Map<string, PendingQuestion>(); // key: frameRpcId(=eventId)
  readonly queues = new Map<string, QueueItem[]>();
  readonly jobs = new Map<string, JobView[]>();
  /** 工作区(workspace/follow 基线 + 增量) */
  readonly workspaces = new Map<string, WorkspaceItem>();
  /** 工作区显示顺序(workspace/follow order 增量) */
  workspaceOrder: string[] = [];
  /** 全局归档会话集合(workspace/follow baseline / archived 增量) */
  readonly archivedSessionIds = new Set<string>();
  /** 会话的目标状态(session.list / 投影帧的 goal 投影) */
  readonly goals = new Map<string, unknown>();
  /** 上下文压力(contextPressure 投影) */
  readonly context = new Map<string, { pressureTokens?: number; projectedTokens?: number; surfaceTokens?: number; contextWindow?: number }>();
  /** 上下文构成(contextBreakdown 投影:系统提示词/工具定义/对话消息的启发式估算) */
  readonly breakdown = new Map<string, { systemTokens: number; toolsTokens: number; messageTokens: number }>();
  /** 权限预设(permissions 投影) */
  readonly permissions = new Map<string, { options: { value: string; name: string; description?: string }[]; currentValue: string }>();
  /** 会话统计(sessionStats / tokenUsage 投影) */
  readonly stats = new Map<string, { sessionStats?: unknown; tokenUsage?: unknown }>();
  /** 待办事项(todos 投影,每回合重置) */
  readonly todos = new Map<string, { content: string; status: "pending" | "in_progress" | "completed" }[] | null>();
  /**
   * 会话当前生效的工作目录(0.2.1 的 workingDirectory 投影 + working-directory/change 事件)。
   * 与会话头 cwd 的区别:后者是创建时的项目目录、永不改变;前者随 working_directory 工具变化,
   * 是后续目录类操作的基准。
   */
  readonly workingDirectories = new Map<string, string | null>();
  /**
   * 限时提问投影(0.2.x 的 userQuestions):active 仍可作答,settled 已结算。
   * 它是「刷新/切换会话后仍能看到待答提问」的唯一来源($events waterfall 只覆盖在线期间)。
   */
  readonly userQuestions = new Map<string, UserQuestionProjection>();
  /**
   * 计划模式投影(dsh-plan-mode 的 `plan`):{active, pending}。
   * 有效目标态 = pending ? !active : active(网页端 PlanChip 同款折算法)。
   */
  readonly plans = new Map<string, PlanProjection>();
  /**
   * 直接子代理目录(subagentCatalog 投影;0.1.7 起取代已移除的 subagents/list 端点)。
   * 只含直接子级:id / createdAt / mode / label(与网页端 header 目录同源)。
   */
  readonly subagentCatalog = new Map<string, { id: string; createdAt?: number; mode?: string; label?: string }[]>();
  /**
   * 逐消息反馈(sessionId → messageId → 当前值)。
   * 来源:0.1.7 的 feedback/message-put|delete 会话事件(仅入日志,不入模型历史)
   * 与 messageFeedback/list 的初始读取。
   */
  readonly feedback = new Map<string, Map<string, MessageFeedbackItem>>();
  /** 某个会话是否已从 messageFeedback/list 读过一次(避免重复拉取)。 */
  readonly feedbackLoaded = new Set<string>();
  /** 每个会话是否还有更早的历史可加载(session/page 分页) */
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
  on(name: "questionCountdown", fn: (frameRpcId: string, remainingMs: number) => void): () => void;
  on(name: "questionCountdownExpired", fn: (frameRpcId: string) => void): () => void;
  on(name: "queue", fn: (sessionId: string, items: QueueItem[]) => void): () => void;
  on(name: "running", fn: (sessionId: string, running: boolean) => void): () => void;
  on(name: "turnEnd", fn: (sessionId: string, turn: number) => void): () => void;
  on(name: "agentError", fn: (sessionId: string, message: string) => void): () => void;
  on(name: "goal", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "context", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "breakdown", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "streamChunk", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "streamEnd", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "permissions", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "stats", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "todos", fn: (sessionId: string, value: unknown) => void): () => void;
  on(name: "subagentCatalog", fn: (sessionId: string) => void): () => void;
  on(name: "workingDirectory", fn: (sessionId: string, cwd: string | null) => void): () => void;
  on(name: "userQuestions", fn: (sessionId: string, value: UserQuestionProjection) => void): () => void;
  on(name: "plan", fn: (sessionId: string, value: PlanProjection) => void): () => void;
  on(name: "jobs", fn: (sessionId: string, jobs: JobView[]) => void): () => void;
  on(name: "feedbackChanged", fn: (sessionId: string) => void): () => void;
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

  /** 通知工作区/归档状态已变化(供外部在改动归档集合后刷新 UI)。 */
  notifyWorkspacesChanged() {
    this.emit("workspaces");
  }

  // ---------- 帧消费(0.1.2:session/follow) ----------

  /** session/follow 的打开快照:回填历史与投影基线。 */
  handleFollowSnapshot(frame: Extract<SessionFollowFrame, { type: "snapshot" }>) {
    const sessionId = frame.header.id;
    this.mergeHistory(sessionId, frame.records.map((r) => this.toStored(r)));
    this.historyHasMore.set(sessionId, frame.hasMore);
    if (frame.projections && typeof frame.projections.values === "object" && frame.projections.values !== null) {
      for (const [key, value] of Object.entries(frame.projections.values)) this.applyProjection(sessionId, key, value);
    }
    this.emit("sessionsChanged", this.listSessions());
  }

  /** session/follow 的逐条事件(传入被跟随的 sessionId)。 */
  handleFollowEvent(sessionId: string, frame: Extract<SessionFollowFrame, { type: "event" }>) {
    this.addEvent(sessionId, frame.event);
  }

  // ---------- 帧消费(0.1.5:assistant-stream 瞬态帧) ----------

  /**
   * 进行中的模型尝试(sessionId → attemptId/turn/step/下一个期望的帧序号)。
   * 0.1.5 的逐 token 增量只以 assistant-stream 帧下发,且帧带序号:
   * 只有序号连续才转发给 UI,断号说明中途挂载,直接丢弃该帧直到下一次 start。
   */
  private readonly assistantAttempts = new Map<string, { attemptId: string; turn: number; step: number; nextIndex: number }>();

  /**
   * 处理一帧 assistant-stream:
   * - start:登记尝试(turn/step 随后的 chunk 帧不再重复携带);
   * - chunk:序号连续时以瞬态事件转发(UI 与 0.1.2 的 assistant/chunk 走同一条渲染路径);
   * - end:committed 交给随后的 assistant/message 结算;abandoned 通知 UI 丢弃已流出的内容。
   */
  handleAssistantStreamFrame(sessionId: string, frame: AssistantStreamFrame) {
    if (frame.type === "start") {
      this.assistantAttempts.set(sessionId, { attemptId: frame.attemptId, turn: frame.turn, step: frame.step, nextIndex: 0 });
      return;
    }
    if (frame.type === "chunk") {
      const attempt = this.assistantAttempts.get(sessionId);
      if (attempt === undefined || attempt.attemptId !== frame.attemptId) return;
      if (frame.index !== attempt.nextIndex) return; // 断号:等待下一次 start 重新同步
      attempt.nextIndex += 1;
      this.emit("streamChunk", sessionId, {
        attemptId: frame.attemptId,
        turn: attempt.turn,
        step: attempt.step,
        index: frame.index,
        time: frame.time,
        chunk: frame.chunk,
      });
      return;
    }
    const attempt = this.assistantAttempts.get(sessionId);
    if (attempt === undefined || attempt.attemptId !== frame.attemptId) return;
    this.assistantAttempts.delete(sessionId);
    this.emit("streamEnd", sessionId, {
      attemptId: frame.attemptId,
      turn: attempt.turn,
      step: attempt.step,
      abandoned: frame.outcome.kind === "abandoned",
      ...(frame.outcome.kind === "committed" ? { committedSeq: frame.outcome.seq, eventType: frame.outcome.eventType } : {}),
    });
  }

  private toStored(record: SessionHistoryRecord): StoredEvent {
    if (record.type === "chunks") {
      // 压缩的 chunk 序列:UI 按未知事件类型忽略,仅占位(消息正文仍由 assistant/message 事件渲染)
      return { event: record.event };
    }
    return { event: record.event };
  }

  // ---------- 帧消费(0.1.2:session/control) ----------

  handleControlFrame(frame: SessionControlFrame) {
    if (frame.type === "baseline") {
      for (const [sessionId, items] of Object.entries(frame.value.queues ?? {})) {
        this.queues.set(sessionId, items);
        this.emit("queue", sessionId, items);
      }
      for (const [sessionId, jobs] of Object.entries(frame.value.jobs ?? {})) {
        this.jobs.set(sessionId, jobs);
        this.emit("jobs", sessionId, jobs);
      }
      for (const [sessionId, projections] of Object.entries(frame.value.projections ?? {})) {
        for (const [key, value] of Object.entries(projections.values ?? {})) this.applyProjection(sessionId, key, value);
      }
      this.emit("sessionsChanged", this.listSessions());
      return;
    }
    if (frame.type === "queue") {
      this.queues.set(frame.sessionId, frame.items);
      this.emit("queue", frame.sessionId, frame.items);
      return;
    }
    if (frame.type === "jobs") {
      this.jobs.set(frame.sessionId, frame.jobs);
      this.emit("jobs", frame.sessionId, frame.jobs);
      return;
    }
    this.applyProjection(frame.sessionId, frame.key, frame.value);
  }

  // ---------- 帧消费(0.1.2:workspace/follow) ----------

  handleWorkspaceFrame(frame: WorkspaceFollowFrame) {
    if (frame.type === "baseline") {
      this.applyWorkspaceList(frame.value.items, frame.value.archivedSessionIds);
      return;
    }
    if (frame.type === "upsert") {
      this.upsertWorkspace(frame.workspace);
      this.emit("workspaces");
      return;
    }
    if (frame.type === "remove") {
      this.workspaces.delete(frame.workspaceId);
      this.workspaceOrder = this.workspaceOrder.filter((id) => id !== frame.workspaceId);
      this.emit("workspaces");
      return;
    }
    if (frame.type === "order") {
      this.workspaceOrder = frame.workspaceIds;
      this.emit("workspaces");
      return;
    }
    this.archivedSessionIds.clear();
    for (const id of frame.archivedSessionIds) this.archivedSessionIds.add(id);
    this.emit("workspaces");
  }

  // ---------- 帧消费(0.1.2:$events;api-session/* 遥测) ----------

  handleApiSessionEvent(event: string, args: unknown[]) {
    const [arg0, arg1] = args as [any, any];
    if (event === "api-session/added") {
      const summary = arg0 as SessionSummary;
      const existing = this.sessions.get(summary.sessionId);
      if (!existing) {
        this.sessions.set(summary.sessionId, {
          sessionId: summary.sessionId,
          running: summary.running ?? false,
          blank: summary.blank ?? false,
          cwd: summary.cwd,
          parentSessionId: summary.parentSessionId,
          origin: summary.origin,
          updatedAt: summary.updatedAt ?? Date.now(),
        });
        this.emit("sessionsChanged", this.listSessions());
      }
      return;
    }
    if (event === "api-session/removed") {
      this.sessions.delete(String(arg0));
      this.emit("sessionsChanged", this.listSessions());
      return;
    }
    if (event === "api-session/status") {
      const s = this.sessions.get(String(arg0));
      if (s) {
        s.running = Boolean(arg1);
        this.emit("running", s.sessionId, s.running);
      }
      return;
    }
    if (event === "api-session/error") {
      const s = this.sessions.get(String(arg0));
      if (s) s.running = false;
      this.emit("agentError", String(arg0), String(arg1 ?? ""));
      return;
    }
    if (event === "api-session/activity") {
      const s = this.sessions.get(String(arg0));
      if (s) {
        s.updatedAt = Number(arg1 ?? Date.now());
        this.emit("sessionsChanged", this.listSessions());
      }
    }
  }

  /** $events 的 emit 帧(宿主远程事件;Cordis 审批/清单等)。 */
  handleRemoteEvent(event: string, args: unknown[]) {
    this.emit("remoteEvent", event, args);
  }

  // ---------- 帧消费(0.1.2:$events waterfall:审批 / 提问) ----------

  handleWaterfall(frame: { event: string; eventId: string; agentId: string; request: unknown }) {
    if (frame.event === "approval/request") {
      const req = (frame.request ?? {}) as { toolName?: string; callId?: string; reason?: string };
      const approval: PendingApproval = {
        sessionId: frame.agentId,
        approvalId: frame.eventId,
        toolName: req.toolName ?? "",
        callId: req.callId,
        reason: req.reason,
        frameRpcId: frame.eventId,
      };
      this.pendingApprovals.set(frame.eventId, approval);
      this.emit("approval", approval);
      this.emit("sessionsChanged", this.listSessions());
      return;
    }
    if (frame.event === "user-questions/request") {
      const req = (frame.request ?? {}) as { questions?: AskUserQuestionItem[]; wait?: { callId?: string; timed?: boolean } };
      const question: PendingQuestion = {
        sessionId: frame.agentId,
        frameRpcId: frame.eventId,
        questions: req.questions ?? [],
        // 0.2.0 异步问答:限时提问带 wait 描述符,作答走 userQuestions/answer 而不是 $events/result
        callId: typeof req.wait?.callId === "string" ? req.wait.callId : undefined,
        timed: req.wait?.timed === true,
      };
      this.pendingQuestions.set(frame.eventId, question);
      this.emit("question", question);
      this.emit("sessionsChanged", this.listSessions());
    }
  }

  /** 限时提问的剩余等待时间(毫秒)下发;到期后宿主结束等待流。 */
  updateQuestionCountdown(frameRpcId: string, remainingMs: number) {
    const question = this.pendingQuestions.get(frameRpcId);
    if (!question) return;
    question.remainingMs = Math.max(0, Math.floor(remainingMs));
    this.emit("questionCountdown", frameRpcId, question.remainingMs);
  }

  /** 等待到期(宿主结束等待流):卡片保留,用户之后仍可作答(0.2.0 异步问答语义)。 */
  expireQuestionWait(frameRpcId: string) {
    const question = this.pendingQuestions.get(frameRpcId);
    if (!question) return;
    question.remainingMs = undefined;
    question.waited = true;
    this.emit("questionCountdownExpired", frameRpcId);
  }

  /** $events 的 cancel 帧(宿主撤回 waterfall:审批/提问被取消)。 */
  handleWaterfallCancel(eventId: string) {
    if (this.pendingApprovals.delete(eventId)) {
      this.emit("approvalResolved", eventId, "cancelled");
      this.emit("sessionsChanged", this.listSessions());
    }
    if (this.pendingQuestions.delete(eventId)) {
      this.emit("questionResolved", eventId);
      this.emit("sessionsChanged", this.listSessions());
    }
  }

  /** 本地回答完一个 waterfall(审批/提问)后清除挂起状态。 */
  resolveWaterfall(eventId: string, outcome: string) {
    if (this.pendingApprovals.delete(eventId)) {
      this.emit("approvalResolved", eventId, outcome);
      this.emit("sessionsChanged", this.listSessions());
    } else if (this.pendingQuestions.delete(eventId)) {
      this.emit("questionResolved", eventId);
      this.emit("sessionsChanged", this.listSessions());
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
          // 此时 running 由 api-session/status 帧置 false)。
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
      // 0.1.7 逐消息反馈:仅入日志(不进模型历史),在此折叠成会话内当前值。
      case "feedback/message-put": {
        const item = event.data?.item as MessageFeedbackItem | undefined;
        if (item?.messageId) {
          this.applyFeedbackItem(sessionId, item);
          this.emit("feedbackChanged", sessionId);
        }
        break;
      }
      case "feedback/message-delete": {
        const messageId = event.data?.messageId as string | undefined;
        if (messageId && this.feedback.get(sessionId)?.delete(messageId) === true) {
          this.emit("feedbackChanged", sessionId);
        }
        break;
      }
      // 0.2.1 工作目录切换:会话头 cwd 不变,后续操作的基准改为事件里的 cwd
      case "working-directory/change": {
        const cwd = event.data?.cwd;
        if (typeof cwd === "string" && cwd !== "") this.applyWorkingDirectory(sessionId, cwd);
        break;
      }
      // 0.2.1 后台任务生命周期(注册 / 结算)
      case "job/registered":
      case "job/settled":
        this.applyJobEvent(sessionId, event.type, event.data);
        break;
      // 计划模式切换事件:投影缺位(老宿主)时也能立即反映到模式芯片
      case "plan/mode": {
        this.applyPlan(sessionId, { active: event.data?.active === true, pending: false });
        break;
      }
    }
  }

  /** 合并一条逐消息反馈(事件流或 messageFeedback/list 的初始读取共用)。 */
  applyFeedbackItem(sessionId: string, item: MessageFeedbackItem) {
    let byMessage = this.feedback.get(sessionId);
    if (!byMessage) this.feedback.set(sessionId, (byMessage = new Map()));
    byMessage.set(item.messageId, item);
  }

  /** 用 messageFeedback/list 的结果覆盖某会话的反馈缓存。 */
  applyFeedbackList(sessionId: string, items: MessageFeedbackItem[]) {
    const byMessage = new Map<string, MessageFeedbackItem>();
    for (const item of items) byMessage.set(item.messageId, item);
    this.feedback.set(sessionId, byMessage);
    this.feedbackLoaded.add(sessionId);
    this.emit("feedbackChanged", sessionId);
  }

  /**
   * 用 session/projections 的完整基线补齐某会话的投影值(0.1.5 起可用)。
   * 会话刚打开、尚未收到任何投影帧时,统计 / 待办 / 权限 / 上下文 / 子代理目录
   * 都靠这一次读取落地;幂等,重复调用只是重放同样的值。
   */
  applyProjectionBaseline(sessionId: string, values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) this.applyProjection(sessionId, key, value);
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
    if (key === "agentPreset" && typeof value === "string" && value) {
      if (s) {
        s.agentPreset = value;
        this.emit("sessionsChanged", this.listSessions());
      }
      return;
    }
    if (key === "goal") {
      this.applyGoal(sessionId, value);
      return;
    }
    if (key === "contextPressure") {
      this.context.set(sessionId, value as { pressureTokens?: number; projectedTokens?: number; surfaceTokens?: number; contextWindow?: number });
      this.emit("context", sessionId, value);
      return;
    }
    if (key === "contextBreakdown") {
      const raw = (value ?? {}) as { systemTokens?: number; toolsTokens?: number; messageTokens?: number };
      this.breakdown.set(sessionId, {
        systemTokens: typeof raw.systemTokens === "number" ? raw.systemTokens : 0,
        toolsTokens: typeof raw.toolsTokens === "number" ? raw.toolsTokens : 0,
        messageTokens: typeof raw.messageTokens === "number" ? raw.messageTokens : 0,
      });
      this.emit("breakdown", sessionId, value);
      return;
    }
    if (key === "permissions") {
      // 会话投影只负责「当前值」;可选项来自进程级目录(permissionPresets/catalog)——
      // 官方网页端同样是 selection=投影 + catalog=目录,这里按同一分工存储,
      // 避免投影缺 options 时把权限下拉清空(见 0.13.32)。
      const incoming = value as { options?: { value: string; name: string }[]; currentValue?: string } | null;
      const merged = {
        options: incoming?.options ?? [],
        currentValue: incoming?.currentValue ?? "",
      };
      this.permissions.set(sessionId, merged);
      this.emit("permissions", sessionId, merged);
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
      return;
    }
    // 0.2.1 会话工作目录投影:null 表示尚未记录;会话头 cwd 不随工具切换而变
    if (key === "workingDirectory") {
      this.applyWorkingDirectory(sessionId, typeof value === "string" && value ? value : null);
      return;
    }
    // 0.2.x 限时提问投影:active/settled 两半,刷新后仍能还原待答卡片
    if (key === "userQuestions") {
      this.applyUserQuestions(sessionId, value as UserQuestionProjection | null);
      return;
    }
    // 计划模式投影(dsh-plan-mode):驱动模式芯片的「已进入 / 切换中」状态
    if (key === "plan") {
      this.applyPlan(sessionId, value as PlanProjection | null);
      return;
    }
    // 0.1.7 子代理目录投影(取代已移除的 subagents/list 端点)
    if (key === "subagentCatalog") {
      const rows = Array.isArray(value) ? (value as { id?: string; createdAt?: number; mode?: string; label?: string }[]) : [];
      this.subagentCatalog.set(
        sessionId,
        rows
          .filter((row) => typeof row?.id === "string")
          .map((row) => ({ id: row.id as string, createdAt: row.createdAt, mode: row.mode, label: row.label })),
      );
      this.emit("subagentCatalog", sessionId);
    }
  }

  /** 记录会话的 goal 投影并通知。 */
  applyGoal(sessionId: string, value: unknown) {
    this.goals.set(sessionId, value);
    this.emit("goal", sessionId, value);
  }

  /** 记录工作目录(投影或 working-directory/change 事件)并通知。 */
  applyWorkingDirectory(sessionId: string, cwd: string | null) {
    const prev = this.workingDirectories.get(sessionId);
    this.workingDirectories.set(sessionId, cwd);
    if (prev === cwd) return;
    this.emit("workingDirectory", sessionId, cwd);
  }

  /** 记录限时提问投影并通知。 */
  applyUserQuestions(sessionId: string, value: UserQuestionProjection | null) {
    const active = Array.isArray(value?.active) ? value!.active.filter((q) => typeof q?.callId === "string") : [];
    const settled = Array.isArray(value?.settled) ? value!.settled.filter((q) => typeof q?.callId === "string") : [];
    const normalized: UserQuestionProjection = { active, settled };
    this.userQuestions.set(sessionId, normalized);
    this.emit("userQuestions", sessionId, normalized);
  }

  /** 记录计划模式投影并通知(只在真的变化时通知,避免每帧刷新芯片)。 */
  applyPlan(sessionId: string, value: PlanProjection | null) {
    const next: PlanProjection = { active: value?.active === true, pending: value?.pending === true };
    const prev = this.plans.get(sessionId);
    this.plans.set(sessionId, next);
    if (prev && prev.active === next.active && prev.pending === next.pending) return;
    this.emit("plan", sessionId, next);
  }

  /**
   * job/registered|job/settled 会话事件 → 后台任务台账(0.2.1 新增)。
   * session/control 的基线在 0.2.x 只带 projections(没有 jobs),这些事件是
   * 面板在 0.2.1 上唯一的实时来源;两者共存时以事件为准(它有终态与进度)。
   */
  applyJobEvent(sessionId: string, type: string, data: unknown) {
    if (type !== "job/registered" && type !== "job/settled") return;
    const row = (data ?? {}) as Partial<JobSettledData> & Partial<JobRegisteredData>;
    if (typeof row.jobId !== "string" || row.jobId === "") return;
    const list = this.jobs.get(sessionId) ?? [];
    const index = list.findIndex((j) => j.id === row.jobId);
    const settled = type === "job/settled";
    const next: JobView = {
      id: row.jobId,
      kind: typeof row.kind === "string" ? row.kind : "job",
      label: typeof row.label === "string" ? row.label : "",
      status: settled ? (row.status ?? "completed") : "running",
      startedAt: typeof row.startedAt === "number" ? row.startedAt : Date.now(),
      ...(settled && typeof row.finishedAt === "number" ? { finishedAt: row.finishedAt } : {}),
      ...(typeof row.detail === "string" && row.detail ? { detail: row.detail } : {}),
      ...(settled ? {} : { progress: typeof (row as { progress?: string }).progress === "string" ? (row as { progress?: string }).progress : undefined }),
    };
    if (index >= 0) list[index] = { ...list[index], ...next };
    else list.push(next);
    this.jobs.set(sessionId, list);
    this.emit("jobs", sessionId, list);
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

  /** 应用 workspace/follow 基线(顺序 + 归档集合)。 */
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
    this.breakdown.clear();
    this.assistantAttempts.clear();
    this.permissions.clear();
    this.stats.clear();
    this.todos.clear();
    this.subagentCatalog.clear();
    this.feedback.clear();
    this.feedbackLoaded.clear();
    this.historyHasMore.clear();
    this.unreadSessionIds.clear();
    this.currentSessionId = undefined;
  }
}
