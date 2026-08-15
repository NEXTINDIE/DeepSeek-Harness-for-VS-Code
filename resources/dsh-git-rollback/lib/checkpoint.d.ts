import { type CheckpointEntry } from "./types.js";
export interface CheckpointOptions {
    gitBin: string;
    refPrefix: string;
    commitPrefix: string;
}
/** 全量快照提交:返回新提交;无改动(树与父一致)时返回 {ok, unchanged}。 */
export declare function snapshotCommit(gitBin: string, cwd: string, parent: string | undefined, message: string): Promise<{
    ok: boolean;
    commit?: string;
    tree?: string;
    unchanged?: boolean;
    reason?: string;
}>;
/** 回合开始时的检查点(每仓库串行化由调用方保证)。 */
export declare function checkpointTurn(gitBin: string, cwd: string, sid: string, turn: number, time: number, opts: CheckpointOptions): Promise<void>;
/**
 * 回合结束快照:记录该回合自身产生的改动(after)。
 * 该回合的改动 = diff(回合开始检查点 → after),供 /undo 精确撤销——只撤销会话自己的改动,
 * 用户回合之后自行提交的内容不受影响。无改动回合不记录 after(撤销时视为无可撤销)。
 */
export declare function checkpointTurnEnd(gitBin: string, cwd: string, sid: string, turn: number, time: number, opts: CheckpointOptions): Promise<void>;
/**
 * 从链重建检查点清单(记录文件丢失时的兜底):沿提交父链走,
 * 解析提交信息里的 `turn <N>`,越新越靠后。
 */
export declare function foldCheckpoints(gitBin: string, cwd: string, sid: string, opts: CheckpointOptions): Promise<CheckpointEntry[]>;
