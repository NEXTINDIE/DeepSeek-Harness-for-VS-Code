/**
 * 记录文件与 git 对象的共享类型(插件与 VSCode 扩展的联动契约)。
 *
 * 说明:计划原定的会话日志事件(git-checkpoint / git/rollback / git/redo,
 * `ignorable: true`)在当前 rc.6 构建无法安全实现——`Session.append()` 不接受
 * `ignorable` 标记,且 `dsh-session` 的 known-event-types 目录明确写着
 * "a registration surface for them is deferred until such a consumer exists";
 * 未标记的自定义事件会让持久化读取路径在重启后拒绝整个会话日志。
 * 因此持久化落在工作区 `.dsh/rollback/<sessionId>.json`(重启后仍在)+
 * 隐藏 git ref(refs/dsh/*,gc 不可回收),检查点链可随时从 ref + 提交父链重建。
 */
export interface CheckpointEntry {
    /** 回合号;检查点代表「该回合开始前」的工作区状态。 */
    turn: number;
    /** 检查点提交(全量快照树,含当时的未跟踪文件)。 */
    commit: string;
    /** 上一个检查点提交(链);首检查点为当时的 HEAD。 */
    parent?: string;
    /** 快照时刻(epoch ms)。 */
    time: number;
    /** 快照时的未跟踪文件清单(相对仓库根,精确清理依据)。 */
    untracked: string[];
    /** 清单超限截断时置 true,回退跳过精确清理并提示。 */
    truncated: boolean;
    /** 回合结束快照:该回合产生的改动 = diff(commit → after.commit),供 /undo 精确撤销。 */
    after?: {
        commit: string;
        time: number;
    };
}
export interface RollEntry {
    /** 回退目标回合。 */
    turn: number;
    /** 回退到的检查点提交。 */
    to: string;
    /** 保存点提交(回退前的完整状态,含未跟踪文件;/redo 恢复)。 */
    redo: string;
    /** 回退时删除的新建未跟踪文件数。 */
    removed: number;
    /** 回退前的未跟踪文件清单(/redo 清理依据)。 */
    untracked: string[];
    truncated: boolean;
    time: number;
    redoneAt?: number;
}
export interface RollbackRecord {
    version: 2;
    sessionId: string;
    cwd: string;
    updatedAt?: number;
    checkpoints: CheckpointEntry[];
    rolls: RollEntry[];
    /** 精确撤销记录(/undo 成功执行过的回合)。 */
    undos?: {
        turn: number;
        time: number;
    }[];
}
export declare const RECORD_DIR = ".dsh/rollback";
export declare const DEFAULT_REF_PREFIX = "refs/dsh";
export declare const DEFAULT_COMMIT_PREFIX = "dsh-checkpoint";
export declare const MAX_CHECKPOINTS = 100;
export declare const MAX_ROLLS = 20;
export declare const MAX_UNTRACKED = 1000;
