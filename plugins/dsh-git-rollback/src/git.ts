/**
 * git 执行封装:execFile Promise 化 + 常用子命令与记录文件 IO。
 * 真实插件运行在 dsh 宿主进程内,直接使用 node:child_process。
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_UNTRACKED,
  RECORD_DIR,
  type RollbackRecord,
} from "./types.js";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface GitExecOptions {
  timeoutMs?: number;
  /** 写入 stdin 后关闭(如 git apply - 的补丁管道)。 */
  stdin?: string;
}

export function gitExec(gitBin: string, cwd: string, args: string[], opts: GitExecOptions = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMs ?? 30000);
    child.stdout.on("data", (d: Buffer) => stdout.push(d));
    child.stderr.on("data", (d: Buffer) => stderr.push(d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        stdout: Buffer.concat(stdout).toString("utf8").trim(),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      });
    });
    if (opts.stdin !== undefined) child.stdin.write(opts.stdin, "utf8");
    child.stdin.end();
  });
}

/** commit-tree 的身份兜底:缺失 user.name/email 时以插件身份重试。(-c 必须在子命令之前) */
export async function commitTree(gitBin: string, cwd: string, tree: string, parent: string | undefined, message: string): Promise<GitResult> {
  const args = ["-c", "commit.gpgsign=false", "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message];
  const first = await gitExec(gitBin, cwd, args);
  if (first.ok) return first;
  return gitExec(gitBin, cwd, [
    "-c", "user.name=dsh-checkpoint", "-c", "user.email=dsh-checkpoint@localhost",
    "-c", "commit.gpgsign=false", "commit-tree", tree,
    ...(parent ? ["-p", parent] : []), "-m", message,
  ]);
}

export function sanitizeRefPart(value: string): string {
  const s = String(value).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return s || "x";
}

export function shortHash(hash: string): string {
  return String(hash).slice(0, 8);
}

export function checkpointRef(refPrefix: string, sid: string): string {
  return `${refPrefix}/checkpoints/${sanitizeRefPart(sid)}`;
}

export function saveRef(refPrefix: string, sid: string): string {
  return `${refPrefix}/saves/${sanitizeRefPart(sid)}`;
}

export function recordPath(cwd: string, sid: string): string {
  return join(cwd, RECORD_DIR, `${sanitizeRefPart(sid)}.json`);
}

/** 当前未跟踪文件清单(相对路径,排除 ignored 与插件自己的 .dsh/rollback 记录;超限截断)。 */
export async function untrackedList(gitBin: string, cwd: string): Promise<{ files: string[]; truncated: boolean }> {
  const res = await gitExec(gitBin, cwd, ["ls-files", "-o", "--exclude-standard", "--exclude=.dsh/rollback"]);
  if (!res.ok) return { files: [], truncated: false };
  const files = res.stdout.length > 0 ? res.stdout.split(/\r?\n/) : [];
  if (files.length > MAX_UNTRACKED) return { files: files.slice(0, MAX_UNTRACKED), truncated: true };
  return { files, truncated: false };
}

/** 删除工作区内的单个相对路径(仅文件;路径经安全校验)。 */
export async function rmPath(cwd: string, rel: string): Promise<void> {
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return;
  try {
    rmSync(join(cwd, rel), { force: true });
  } catch {
    // 删除失败不阻塞回退主流程
  }
}

/** 读取记录文件;兼容 v1(turns[])自动迁移为 v2(checkpoints[])。 */
export function readRecord(cwd: string, sid: string): RollbackRecord | undefined {
  try {
    const raw = readFileSync(recordPath(cwd, sid), "utf8");
    const value = JSON.parse(raw) as Partial<RollbackRecord> & { turns?: { turn?: number; commit?: string; time?: number }[] };
    if (!value || typeof value !== "object") return undefined;
    if (!Array.isArray(value.checkpoints) && Array.isArray(value.turns)) {
      // v1 旧记录:检查点无父链,精确清理不可用(标记截断,回退时跳过清理)
      value.checkpoints = value.turns.map((t) => ({
        turn: typeof t?.turn === "number" ? t.turn : 0,
        commit: String(t?.commit ?? ""),
        time: typeof t?.time === "number" ? t.time : 0,
        untracked: [],
        truncated: true,
      }));
      value.version = 2;
    }
    if (!Array.isArray(value.checkpoints)) return undefined;
    const record: RollbackRecord = {
      version: 2,
      sessionId: String(value.sessionId ?? sid),
      cwd: String(value.cwd ?? cwd),
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
      checkpoints: value.checkpoints.filter(
        (c): c is RollbackRecord["checkpoints"][number] =>
          !!c && typeof c.turn === "number" && typeof c.commit === "string" && c.commit.length > 0,
      ),
      rolls: Array.isArray(value.rolls)
        ? value.rolls.filter(
            (r): r is RollbackRecord["rolls"][number] =>
              !!r && typeof r.to === "string" && typeof r.redo === "string",
          )
        : [],
      undos: Array.isArray(value.undos)
        ? value.undos.filter((u): u is NonNullable<RollbackRecord["undos"]>[number] => !!u && typeof u.turn === "number")
        : [],
    };
    return record;
  } catch {
    return undefined;
  }
}

export function writeRecord(cwd: string, sid: string, record: RollbackRecord): void {
  try {
    mkdirSync(join(cwd, RECORD_DIR), { recursive: true });
    writeFileSync(recordPath(cwd, sid), JSON.stringify(record, null, 2), "utf8");
  } catch (error) {
    console.error("[dsh-git-rollback] record write failed:", error);
  }
}
