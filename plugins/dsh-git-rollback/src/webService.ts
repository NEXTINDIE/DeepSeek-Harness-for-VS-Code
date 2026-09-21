/**
 * 网页端「还原检查点」的 host 半:注册两条 HTTP 路由,供网页端 client 半
 * (dsh-git-rollback/client)调用 —— 预览某回合自身改动、执行 /undo N。
 *
 *  - POST /dsh-rollback/preview  body {sessionId, turn}
 *    → 读 .dsh/rollback/<sid>.json 记录,git diff --numstat 回合开始→结束,
 *      返回 {files:[{path,added,deleted,binary}], addedTotal, deletedTotal}
 *  - POST /dsh-rollback/apply     body {sessionId, turn}
 *    → 经 commands.execute 执行 "/undo N"(与 VS Code 扩展同一通道),
 *      返回 {ok, text}
 *
 * 设计:client 半零 DSH 依赖(纯 fetch + react),不引入 typert/remote 注册;
 * 路由走 webServer 服务,与网页端同源。
 */
import type { Context } from "@deepseek-ai/cordis";
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gitExec, readRecord } from "./git.js";

/** SessionId 是 branded 类型;HTTP body 里的是普通字符串。 */
function asSessionId(s: string): SessionId {
  return s as SessionId;
}

interface PreviewBody {
  sessionId?: unknown;
  turn?: unknown;
}

/** 读取 JSON 请求体(上限 64KB)。 */
function readJsonBody(req: IncomingMessage): Promise<PreviewBody> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (d: Buffer) => {
      size += d.length;
      if (size > 64 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(d);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

/** 解析 git diff --numstat 输出。 */
function parseNumstat(stdout: string): { files: { path: string; added: number; deleted: number; binary: boolean }[]; addedTotal: number; deletedTotal: number } {
  const files: { path: string; added: number; deleted: number; binary: boolean }[] = [];
  let addedTotal = 0;
  let deletedTotal = 0;
  for (const line of String(stdout ?? "").split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const path = parts.slice(2).join("\t");
    const binary = parts[0] === "-" || parts[1] === "-";
    const added = binary ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deleted = binary ? 0 : Number.parseInt(parts[1], 10) || 0;
    files.push({ path, added, deleted, binary });
    addedTotal += added;
    deletedTotal += deleted;
  }
  return { files, addedTotal, deletedTotal };
}

export interface WebRollbackOptions {
  gitBin: string;
}

/** 注册网页端路由;返回 disposer。 */
export function registerWebRoutes(ctx: Context, opts: WebRollbackOptions): () => void {
  const disposers: (() => void)[] = [];

  const preview: WebRoute = {
    kind: "exact",
    path: "/dsh-rollback/preview",
    async handler(req, res) {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      const body = await readJsonBody(req);
      const sid = typeof body.sessionId === "string" ? body.sessionId : undefined;
      const turn = typeof body.turn === "number" ? body.turn : undefined;
      if (!sid || !(typeof turn === "number")) {
        sendJson(res, 400, { error: "缺少 sessionId 或回合号" });
        return;
      }
      try {
        const sessions = ctx.get("sessions");
        const session = sessions?.get(asSessionId(sid));
        const header = session && (session as { header?: { cwd?: string } }).header;
        const cwd = header?.cwd;
        if (!cwd) {
          sendJson(res, 404, { error: "会话没有工作目录" });
          return;
        }
        const record = readRecord(cwd, sid);
        if (!record) {
          sendJson(res, 404, { error: "没有检查点记录(需要服务端 dsh-git-rollback 插件)" });
          return;
        }
        const entry = record.checkpoints.find((c) => c && c.turn === turn);
        if (!entry || !entry.after) {
          sendJson(res, 404, { error: "该回合没有可精确撤销的快照" });
          return;
        }
        const diff = await gitExec(opts.gitBin, cwd, ["diff", "--numstat", entry.commit, entry.after.commit, "--"]);
        if (!diff.ok) {
          sendJson(res, 500, { error: `生成差异失败:${diff.stderr || "git diff failed"}` });
          return;
        }
        const { files, addedTotal, deletedTotal } = parseNumstat(diff.stdout);
        sendJson(res, 200, {
          turn: entry.turn,
          time: typeof entry.time === "number" ? entry.time : 0,
          files,
          addedTotal,
          deletedTotal,
        });
      } catch (error) {
        sendJson(res, 500, { error: String(error) });
      }
    },
  };

  const apply: WebRoute = {
    kind: "exact",
    path: "/dsh-rollback/apply",
    async handler(req, res) {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      const body = await readJsonBody(req);
      const sid = typeof body.sessionId === "string" ? body.sessionId : undefined;
      const turn = typeof body.turn === "number" ? body.turn : undefined;
      if (!sid || !(typeof turn === "number")) {
        sendJson(res, 400, { error: "缺少 sessionId 或回合号" });
        return;
      }
      try {
        const agents = ctx.get("agents");
        const commands = ctx.get("commands");
        if (!agents || !commands) {
          sendJson(res, 503, { error: "命令服务不可用" });
          return;
        }
        const agent = agents.get(asSessionId(sid));
        if (!agent) {
          sendJson(res, 404, { error: "会话没有运行中的 agent" });
          return;
        }
        const execution = await commands.execute(agent, `/undo ${turn}`, new AbortController().signal);
        if (!execution) {
          sendJson(res, 404, { error: "/undo 命令未找到(服务端插件未加载?)" });
          return;
        }
        const text = execution.result && typeof execution.result.text === "string" ? execution.result.text : "";
        sendJson(res, 200, {
          ok: execution.result ? execution.result.kind === "success" : false,
          text,
        });
      } catch (error) {
        sendJson(res, 500, { error: String(error) });
      }
    },
  };

  const ws = ctx.get("webServer");
  if (ws && typeof ws.register === "function") {
    disposers.push(ws.register(preview));
    disposers.push(ws.register(apply));
  }
  return () => {
    for (const d of disposers) d();
  };
}
