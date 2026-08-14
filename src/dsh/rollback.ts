import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";

/**
 * 回合级 Git 回退(宿主侧执行器)。
 *
 * 服务端 DSH 插件在每个回合开始(turn/start)时对工作区做 git 快照
 * (write-tree → add -A → stash create → read-tree 还原索引,完整收录未跟踪文件),
 * 并把记录写入 `<cwd>/.dsh/rollback/<sessionId>.json`、git ref 写入
 * `refs/dsh/rollback/<sessionId>/<turn>`。本模块读取该记录并在本地执行恢复。
 */

export interface RollbackTurn {
  turn: number;
  seq: number;
  time: number;
  commit: string;
}

export interface RollbackRecord {
  version: number;
  sessionId: string;
  cwd: string;
  updatedAt?: number;
  turns: RollbackTurn[];
}

export type RollbackRestoreResult =
  | { ok: true; turn: number; warn?: string }
  | {
      ok: false;
      code: "no-checkpoint" | "not-git" | "snapshot-failed" | "restore-failed";
      detail?: string;
    };

const RECORD_DIR = ".dsh/rollback";
const SAFETY_REF_PREFIX = "refs/dsh/rollback/__safety";

/** 与服务端插件一致的记录文件名清理规则(跨进程契约)。 */
export function sanitizeRecordName(value: string): string {
  const s = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return s || "x";
}

export function recordFilePath(cwd: string, sessionId: string): string {
  return join(cwd, RECORD_DIR, `${sanitizeRecordName(sessionId)}.json`);
}

/** 优先使用 VS Code 内置 git 扩展提供的可执行路径,回退 PATH 上的 git。 */
function resolveGitPath(): string {
  try {
    const gitExt = vscode.extensions.getExtension<{ getAPI(version: 1): { git: { path: string } } }>("vscode.git");
    const path = gitExt?.exports?.getAPI(1)?.git?.path;
    if (path) return path;
  } catch {
    // 内置 git 扩展不可用时回退 PATH
  }
  return "git";
}

function gitExec(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      resolveGitPath(),
      args,
      { cwd, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout ?? "").trim(),
          stderr: String(stderr ?? "").trim(),
        });
      },
    );
  });
}

/** 读取某会话的回合快照记录;缺失或损坏时返回 undefined。 */
export async function loadRollbackRecord(cwd: string, sessionId: string): Promise<RollbackRecord | undefined> {
  try {
    const raw = await readFile(recordFilePath(cwd, sessionId), "utf8");
    const value = JSON.parse(raw) as RollbackRecord;
    if (!value || typeof value !== "object" || !Array.isArray(value.turns)) return undefined;
    value.turns = value.turns.filter((t) => t && typeof t.turn === "number" && typeof t.commit === "string");
    value.turns.sort((a, b) => a.turn - b.turn);
    return value;
  } catch {
    return undefined;
  }
}

/**
 * 快照当前工作区(与服务端插件同一算法):
 * write-tree 保存用户索引 → add -A 收录全部未跟踪文件 → stash create 生成快照提交
 * → read-tree 精确恢复用户索引。失败时也保证索引被还原。
 */
async function snapshotGit(cwd: string): Promise<{ ok: boolean; hash?: string; reason?: string }> {
  const idx = await gitExec(cwd, ["write-tree"]);
  if (!idx.ok) return { ok: false, reason: `write-tree: ${idx.stderr || "failed"}` };
  try {
    const add = await gitExec(cwd, ["add", "-A"]);
    if (!add.ok) return { ok: false, reason: `add: ${add.stderr || "failed"}` };
    const snap = await gitExec(cwd, ["stash", "create"]);
    if (!snap.ok) return { ok: false, reason: `stash create: ${snap.stderr || "failed"}` };
    let hash = snap.stdout;
    if (!/^[0-9a-f]{40}$/.test(hash)) {
      // 无改动:快照等于 HEAD
      const head = await gitExec(cwd, ["rev-parse", "HEAD"]);
      if (head.ok && /^[0-9a-f]{40}$/.test(head.stdout)) hash = head.stdout;
      else return { ok: false, reason: "no snapshot hash produced" };
    }
    return { ok: true, hash };
  } finally {
    await gitExec(cwd, ["read-tree", idx.stdout]);
  }
}

/**
 * 把工作区内容恢复到指定快照提交:
 * read-tree --reset -u 使工作区+索引等于快照树(遇未跟踪文件阻塞时清理后重试一次);
 * clean -fd 删除快照后新建的未跟踪文件(快照内文件此时在索引中,受保护);
 * reset --quiet 把索引还原回 HEAD,避免污染用户暂存区。
 */
async function restoreTree(cwd: string, commit: string): Promise<{ ok: boolean; reason?: string; warn?: string }> {
  const first = await gitExec(cwd, ["read-tree", "--reset", "-u", commit]);
  if (!first.ok) {
    await gitExec(cwd, ["clean", "-fd"]);
    const retry = await gitExec(cwd, ["read-tree", "--reset", "-u", commit]);
    if (!retry.ok) return { ok: false, reason: `read-tree: ${retry.stderr || first.stderr || "failed"}` };
  }
  const clean = await gitExec(cwd, ["clean", "-fd"]);
  const reset = await gitExec(cwd, ["reset", "--quiet"]);
  if (!clean.ok || !reset.ok) return { ok: true, warn: `clean/reset: ${clean.stderr || reset.stderr || ""}`.trim() };
  return { ok: true };
}

/**
 * 执行回合级回退:先做安全快照(失败即中止),再把工作区恢复到目标回合开始前的状态。
 * 恢复失败时自动还原到安全快照并返回错误。
 */
export async function restoreToTurn(cwd: string, record: RollbackRecord, turn: number): Promise<RollbackRestoreResult> {
  const entry = record.turns.find((t) => t.turn === turn);
  if (!entry) return { ok: false, code: "no-checkpoint" };
  const top = await gitExec(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok || !top.stdout) return { ok: false, code: "not-git", detail: cwd };

  const safety = await snapshotGit(cwd);
  if (!safety.ok || !safety.hash) return { ok: false, code: "snapshot-failed", detail: safety.reason };
  const safetyRef = `${SAFETY_REF_PREFIX}/${Date.now()}`;
  await gitExec(cwd, ["update-ref", safetyRef, safety.hash, ""]);

  const restored = await restoreTree(cwd, entry.commit);
  if (!restored.ok) {
    // 恢复失败:回到回退前的状态,绝不留下半成品
    await restoreTree(cwd, safety.hash);
    return { ok: false, code: "restore-failed", detail: restored.reason };
  }
  return { ok: true, turn, ...(restored.warn ? { warn: restored.warn } : {}) };
}
