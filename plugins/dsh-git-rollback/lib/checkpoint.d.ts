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
 * 从链重建检查点清单(记录文件丢失时的兜底):沿提交父链走,
 * 解析提交信息里的 `turn <N>`,越新越靠后。
 */
export declare function foldCheckpoints(gitBin: string, cwd: string, sid: string, opts: CheckpointOptions): Promise<CheckpointEntry[]>;
