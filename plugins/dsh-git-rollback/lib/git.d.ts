import { type RollbackRecord } from "./types.js";
export interface GitResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}
export interface GitExecOptions {
    timeoutMs?: number;
    /** 写入 stdin 后关闭(如 git apply - 的补丁管道)。 */
    stdin?: string;
    /**
     * 是否对 stdout 做 trim(去首尾空白)。默认 true;
     * 取补丁等需逐字节完整的内容时设 false——git diff 输出以换行结尾,
     * trim 会删掉末尾换行导致 `git apply` 报 "corrupt patch"。
     */
    trim?: boolean;
}
export declare function gitExec(gitBin: string, cwd: string, args: string[], opts?: GitExecOptions): Promise<GitResult>;
/** commit-tree 的身份兜底:缺失 user.name/email 时以插件身份重试。(-c 必须在子命令之前) */
export declare function commitTree(gitBin: string, cwd: string, tree: string, parent: string | undefined, message: string): Promise<GitResult>;
export declare function sanitizeRefPart(value: string): string;
export declare function shortHash(hash: string): string;
export declare function checkpointRef(refPrefix: string, sid: string): string;
export declare function saveRef(refPrefix: string, sid: string): string;
export declare function recordPath(cwd: string, sid: string): string;
/** 当前未跟踪文件清单(相对路径,排除 ignored 与插件自己的 .dsh/rollback 记录;超限截断)。 */
export declare function untrackedList(gitBin: string, cwd: string): Promise<{
    files: string[];
    truncated: boolean;
}>;
/** 删除工作区内的单个相对路径(仅文件;路径经安全校验)。 */
export declare function rmPath(cwd: string, rel: string): Promise<void>;
/** 读取记录文件;兼容 v1(turns[])自动迁移为 v2(checkpoints[])。 */
export declare function readRecord(cwd: string, sid: string): RollbackRecord | undefined;
export declare function writeRecord(cwd: string, sid: string, record: RollbackRecord): void;
