import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 回合级 Git 回退(扩展侧只读部分)。
 *
 * 快照与回退执行全部由 DSH 服务端插件 `dsh-git-rollback` 负责
 * (/rollback /redo /checkpoints 命令,经 commands/execute 通道);
 * 扩展只读取插件写入工作区的记录文件 `.dsh/rollback/<sessionId>.json`,
 * 用于在消息操作条上显示每回合的回退按钮与状态。
 */

export interface RollbackCheckpoint {
  turn: number;
  commit: string;
  parent?: string;
  time: number;
  untracked: string[];
  truncated: boolean;
}

export interface RollbackRecord {
  version: number;
  sessionId: string;
  cwd: string;
  updatedAt?: number;
  /** v2:checkpoints[](链式检查点);v1 兼容:turns[](旧记录,读取时归一化)。 */
  checkpoints: RollbackCheckpoint[];
  rolls: { turn: number; to: string; redo: string; removed: number; time: number }[];
}

const RECORD_DIR = ".dsh/rollback";

/** 与服务端插件一致的记录文件名清理规则(跨进程契约)。 */
export function sanitizeRecordName(value: string): string {
  const s = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return s || "x";
}

export function recordFilePath(cwd: string, sessionId: string): string {
  return join(cwd, RECORD_DIR, `${sanitizeRecordName(sessionId)}.json`);
}

/** 读取某会话的回合检查点记录;v1(turns[])自动归一化;缺失或损坏时返回 undefined。 */
export async function loadRollbackRecord(cwd: string, sessionId: string): Promise<RollbackRecord | undefined> {
  try {
    const raw = await readFile(recordFilePath(cwd, sessionId), "utf8");
    const value = JSON.parse(raw) as RollbackRecord & { turns?: { turn?: number; commit?: string; time?: number }[] };
    if (!value || typeof value !== "object") return undefined;
    if (!Array.isArray(value.checkpoints) && Array.isArray(value.turns)) {
      value.checkpoints = value.turns.map((t) => ({
        turn: typeof t?.turn === "number" ? t.turn : 0,
        commit: String(t?.commit ?? ""),
        time: typeof t?.time === "number" ? t.time : 0,
        untracked: [],
        truncated: true,
      }));
    }
    if (!Array.isArray(value.checkpoints)) return undefined;
    value.checkpoints = value.checkpoints.filter(
      (c) => !!c && typeof c.turn === "number" && typeof c.commit === "string" && c.commit.length > 0,
    );
    value.checkpoints.sort((a, b) => a.turn - b.turn);
    value.rolls = Array.isArray(value.rolls) ? value.rolls : [];
    return value;
  } catch {
    return undefined;
  }
}
