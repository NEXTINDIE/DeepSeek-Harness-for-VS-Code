import * as vscode from "vscode";
import { createTranslator } from "./i18n";
import type { DshHub } from "./hub";
import { folderCwd, getParticipantSession, setParticipantSession } from "./participantSessions";
import type { StoredEvent } from "./sessionStore";

/**
 * 本地最小类型:兼容 @types/vscode 1.90。
 * 内置聊天参与者 API(vscode.chat)自 VS Code 1.95 起才有官方类型;
 * 运行时时通过特性检测调用,这里只声明用到的字段。
 */
export interface ChatRequestLike {
  prompt: string;
  command?: string;
}

export interface ChatStreamLike {
  markdown(value: string): void;
  progress(value: string): void;
  button?(command: vscode.Command): void;
}

export interface ChatResultLike {
  metadata: { command: string };
}

export interface ChatContextLike {
  history: unknown[];
}

const THROTTLE_MS = 120;
const t = createTranslator();
const MAX_REASONING_CHARS = 4000;
const MAX_ARGS_CHARS = 1200;
const MAX_RESULT_CHARS = 2000;

/** 去除文本中的 emoji(与聊天面板一致,保持全界面无 emoji)。 */
function clean(text: string): string {
  return text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23E9}-\u{23FA}\u{2139}\u{2B06}\u{2B07}\u{25B6}\u{25C0}]/gu, "");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…(已截断,共 ${text.length} 字符)`;
}

function prettyArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function extractToolResultText(data: any): string {
  const blocks: unknown = data?.message?.content?.[0]?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
}

function reasoningToMarkdown(text: string): string {
  const body = text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
  return `> 思考过程\n${body}`;
}

interface ChunkInfo {
  type: string;
  index?: number;
  blockType?: string;
  text?: string;
  argumentsDelta?: string;
  name?: string;
}

/** 把一个会话的实时事件流折进 ChatResponseStream。 */
class StreamFollower {
  private textBuf = "";
  private reasoningBuf = "";
  private curBlock: "text" | "reasoning" | undefined;
  private streamedBlocks = new Set<string>(); // `${turn}:${step}:${index}`
  private throttleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private unsubs: vscode.Disposable[] = [];

  constructor(
    private readonly hub: DshHub,
    private readonly sessionId: string,
    private readonly stream: ChatStreamLike,
    token: vscode.CancellationToken,
  ) {
    const onEvent = (sid: string, stored: StoredEvent) => {
      if (sid !== this.sessionId) return;
      this.handleEvent(stored);
    };
    const onApproval = (approval: { sessionId: string; approvalId: string; toolName: string; reason?: string }) => {
      if (approval.sessionId !== this.sessionId) return;
      this.flushAll();
      const reason = approval.reason ? `\n\n> ${truncate(approval.reason, 300)}` : "";
      this.stream.markdown(`**等待审批:调用工具 \`${clean(approval.toolName)}\`**${reason}`);
      this.addButton(t("允许"), "dsh.respond", { sessionId: this.sessionId, approvalId: approval.approvalId, outcome: "allowed-once" });
      this.addButton(t("拒绝"), "dsh.respond", { sessionId: this.sessionId, approvalId: approval.approvalId, outcome: "rejected" });
    };
    const onApprovalResolved = (approvalId: string, outcome: string) => {
      if (outcome === "allowed-once") this.stream.markdown(t("已允许"));
      else this.stream.markdown(t("已拒绝"));
    };
    const onQuestion = (q: { sessionId: string; frameRpcId: string; questions: { id: string; question: string; detail?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean }[] }) => {
      if (q.sessionId !== this.sessionId) return;
      this.flushAll();
      const parts = q.questions.map((item) => {
        const detail = item.detail ? `\n\n${item.detail}` : "";
        const options = item.options?.map((o) => `- ${o.label}`).join("\n") ?? "";
        return `**${item.question}**${detail}${options ? `\n\n${options}` : ""}`;
      });
      this.stream.markdown(parts.join("\n\n"));
      for (const item of q.questions) {
        if (item.multiSelect) {
          this.stream.markdown(t("*(多选提问请到 DSH 聊天面板中回答)*"));
          continue;
        }
        for (const option of item.options ?? []) {
          this.addButton(option.label, "dsh.respondQuestion", {
            sessionId: this.sessionId,
            frameRpcId: q.frameRpcId,
            answers: [{ id: item.id, selected: [option.label] }],
          });
        }
      }
      if (q.questions.every((item) => !item.options?.length)) {
        this.stream.markdown(t("*(该提问无可选项,请到 DSH 聊天面板中回答)*"));
      }
    };
    this.unsubs.push(
      { dispose: this.hub.store.on("sessionEvent", onEvent) },
      { dispose: this.hub.store.on("approval", onApproval) },
      { dispose: this.hub.store.on("approvalResolved", onApprovalResolved) },
      { dispose: this.hub.store.on("question", onQuestion) },
      token.onCancellationRequested(() => {
        void this.hub.cancel(this.sessionId);
        this.flushAll();
      }),
    );
  }

  private addButton(title: string, command: string, args: unknown) {
    try {
      const cmd: vscode.Command = { command, title, arguments: [args] };
      this.stream.button?.(cmd);
    } catch {
      // 按钮 API 不可用时静默降级
    }
  }

  private scheduleFlush() {
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = undefined;
      if (this.disposed) return;
      this.flushCurrentBlock(false);
    }, THROTTLE_MS);
  }

  /** 输出当前缓冲块;final=true 表示块边界(最终确定)。 */
  private flushCurrentBlock(final: boolean) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = undefined;
    }
    if (this.curBlock === "text" && this.textBuf) {
      this.stream.markdown(this.textBuf);
      this.textBuf = "";
    } else if (this.curBlock === "reasoning" && this.reasoningBuf) {
      if (final) {
        this.stream.markdown(reasoningToMarkdown(truncate(this.reasoningBuf, MAX_REASONING_CHARS)));
      }
      this.reasoningBuf = "";
    }
    if (final) this.curBlock = undefined;
  }

  private flushAll() {
    if (this.curBlock === "reasoning") this.curBlock = undefined;
    this.flushCurrentBlock(true);
    // 兜底:未流式输出的文本块直接丢弃缓冲
    this.textBuf = "";
    this.reasoningBuf = "";
  }

  private handleChunk(chunk: ChunkInfo, turn: number, step: number) {
    switch (chunk.type) {
      case "block-start": {
        this.flushCurrentBlock(true);
        this.streamedBlocks.add(`${turn}:${step}:${chunk.index ?? -1}`);
        this.curBlock = chunk.blockType === "reasoning" ? "reasoning" : "text";
        break;
      }
      case "text-delta":
        if (this.curBlock !== "text") {
          this.flushCurrentBlock(true);
          this.curBlock = "text";
        }
        if (typeof chunk.text === "string") {
          this.textBuf += clean(chunk.text);
          this.scheduleFlush();
        }
        break;
      case "reasoning-delta":
        if (this.curBlock !== "reasoning") {
          this.flushCurrentBlock(true);
          this.curBlock = "reasoning";
        }
        if (typeof chunk.text === "string") this.reasoningBuf += clean(chunk.text);
        break;
      default:
        break;
    }
  }

  private handleEvent(stored: StoredEvent) {
    const event = stored.event;
    switch (event.type) {
      case "assistant/chunk":
        this.handleChunk(event.data?.chunk ?? {}, event.data?.turn ?? 0, event.data?.step ?? 0);
        break;
      case "assistant/message": {
        // 权威消息:补发未被流式覆盖的文本块
        const turn = event.data?.turn ?? 0;
        const step = event.data?.step ?? 0;
        const content: any[] = event.data?.message?.content ?? [];
        this.flushCurrentBlock(true);
        for (let i = 0; i < content.length; i++) {
          const block = content[i];
          if (block?.type !== "text" || typeof block.text !== "string") continue;
          if (this.streamedBlocks.has(`${turn}:${step}:${i}`)) continue;
          this.streamedBlocks.add(`${turn}:${step}:${i}`);
          if (block.text) this.stream.markdown(block.text);
        }
        break;
      }
      case "tool/call": {
        this.flushAll();
        const name: string = event.data?.name ?? "unknown";
        const args = prettyArgs(event.data?.arguments ?? "");
        this.stream.markdown(`**调用工具 \`${clean(name)}\`**\n\n\`\`\`json\n${truncate(args, MAX_ARGS_CHARS)}\n\`\`\``);
        break;
      }
      case "tool/result": {
        this.flushAll();
        const text = extractToolResultText(event.data);
        if (text) this.stream.markdown(`**工具结果**\n\n\`\`\`\n${clean(truncate(text, MAX_RESULT_CHARS))}\n\`\`\``);
        break;
      }
      case "step/start": {
        const step = event.data?.step;
        if (typeof step === "number" && step > 1) this.stream.progress(`执行步骤 ${step} …`);
        break;
      }
      case "turn/end":
        this.flushAll();
        break;
      default:
        break;
    }
  }

  dispose() {
    this.disposed = true;
    this.flushAll();
    if (this.throttleTimer) clearTimeout(this.throttleTimer);
    for (const unsub of this.unsubs) unsub.dispose();
  }
}

export function registerChatParticipant(hub: DshHub, ctx: vscode.ExtensionContext): vscode.Disposable | undefined {
  const chat = vscode.chat;
  if (!chat || typeof (chat as any).createChatParticipant !== "function") return undefined;

  let nextPreset: string | undefined;

  async function getOrCreateSession(): Promise<string> {
    const existing = await getParticipantSession(ctx);
    if (existing && hub.store.sessions.has(existing)) return existing;
    const cwd = folderCwd();
    const sessionId = await hub.createSessionForFolder(cwd, nextPreset);
    nextPreset = undefined;
    await setParticipantSession(ctx, sessionId);
    void hub.applyDefaultReasoningEffort(sessionId);
    return sessionId;
  }

  async function newSession(): Promise<string> {
    const cwd = folderCwd();
    const sessionId = await hub.createSessionForFolder(cwd, nextPreset);
    nextPreset = undefined;
    await setParticipantSession(ctx, sessionId);
    void hub.applyDefaultReasoningEffort(sessionId);
    return sessionId;
  }

  const participant = (chat as any).createChatParticipant(
    "dsh",
    async (
      request: ChatRequestLike,
      _context: ChatContextLike,
      stream: ChatStreamLike,
      token: vscode.CancellationToken,
    ): Promise<ChatResultLike> => {
      const ready = await hub.ensureReady();
      if (!ready.ok) {
        stream.markdown(t("pc.cannotConnect", { message: ready.message ?? t("pc.serverUnavailable") }));
        return { metadata: { command: request.command ?? "" } };
      }

      // 斜杠命令:优先 request.command,兜底解析提示词前缀(旧版 VS Code 无 registerChatCommand)
      const promptText = request.prompt.trim();
      let command = request.command ?? "";
      let arg = promptText;
      const prefixMatch = /^\/(new|session|preset)\b\s*(.*)$/s.exec(promptText);
      if (!command && prefixMatch) {
        command = prefixMatch[1];
        arg = prefixMatch[2].trim();
      }

      if (command === "new") {
        try {
          const sessionId = await newSession();
          stream.markdown(t("pc.sessionCreated", { id: sessionId.slice(0, 20) }));
        } catch (error) {
          stream.markdown(t("pc.sessionCreateFailed", { error: error instanceof Error ? error.message : String(error) }));
        }
        return { metadata: { command: request.command ?? "" } };
      }

      if (command === "session") {
        const id = arg.trim();
        if (!id) {
          stream.markdown(t("pc.sessionUsage"));
          return { metadata: { command: request.command ?? "" } };
        }
        await setParticipantSession(ctx, id);
        stream.markdown(t("pc.sessionSwitched", { id }));
        return { metadata: { command: request.command ?? "" } };
      }

      if (command === "preset") {
        const preset = arg.trim();
        if (!preset) {
          stream.markdown(t("pc.presetUsage"));
          return { metadata: { command: request.command ?? "" } };
        }
        nextPreset = preset;
        stream.markdown(t("pc.presetSaved", { name: preset }));
        return { metadata: { command: request.command ?? "" } };
      }

      if (!promptText) {
        stream.markdown(t("pc.promptRequired"));
        return { metadata: { command: request.command ?? "" } };
      }

      let sessionId: string;
      try {
        sessionId = await getOrCreateSession();
      } catch (error) {
        stream.markdown(t("pc.cannotCreate", { error: error instanceof Error ? error.message : String(error) }));
        return { metadata: { command: request.command ?? "" } };
      }

      const follower = new StreamFollower(hub, sessionId, stream, token);
      try {
        await hub.send(sessionId, promptText);
      } catch (error) {
        follower.dispose();
        stream.markdown(t("pc.sendFailed", { error: error instanceof Error ? error.message : String(error) }));
        return { metadata: { command: request.command ?? "" } };
      }
      await hub.waitIdle(sessionId, token);
      follower.dispose();
      return { metadata: { command: request.command ?? "" } };
    },
  );

  participant.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "icon.svg");
  participant.followupProvider = {
    provideFollowups(
      _result: ChatResultLike,
      _context: ChatContextLike,
      _token: vscode.CancellationToken,
    ): { prompt: string; label?: string; commandId?: string; title?: string }[] {
      return [
        { prompt: t("followup.continue"), label: t("followup.continue") },
        { commandId: "dsh.newChat", title: t("followup.newSession"), prompt: "/new" },
      ];
    },
  };

  const disposables: vscode.Disposable[] = [participant];

  const registerCommand = (chat as any).registerChatCommand?.bind(chat);
  if (typeof registerCommand === "function") {
    try {
      disposables.push(registerCommand("dsh", "new", () => ({ title: t("新建会话") })));
      disposables.push(registerCommand("dsh", "session", () => ({ title: t("切换到指定会话") })));
      disposables.push(registerCommand("dsh", "preset", () => ({ title: t("设置下一个会话的预设") })));
    } catch {
      // 旧版本不支持斜杠命令时静默降级
    }
  }

  return vscode.Disposable.from(...disposables);
}
