import type { RollbackRecord } from "./types.js";
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
    /** GIT_INDEX_FILE:快照用独立临时索引,完全绕开真实 .git/index。 */
    indexFile?: string;
    /** index.lock 争用时自动等待重试(写索引命令如 read-tree/reset 开启)。 */
    retryLock?: boolean;
}
export declare function gitExec(gitBin: string, cwd: string, args: string[], opts?: GitExecOptions): Promise<GitResult>;
/** commit-tree 的身份兜底:缺失 user.name/email 时以插件身份重试。(-c 必须在子命令之前) */
export declare function commitTree(gitBin: string, cwd: string, tree: string, parent: string | undefined, message: string): Promise<GitResult>;
export declare function sanitizeRefPart(value: string): string;
export declare function shortHash(hash: string): string;
/**
 * 会话在不同工作目录(典型:Git 工作树)之间切换时,给引用加一段稳定的作用域后缀。
 * 生效目录与会话头 cwd(项目原始目录)一致时返回 undefined —— 保持旧的引用名,
 * 老会话的检查点链不会因为这次升级而失联。
 */
export declare function cwdScope(cwd: string, headerCwd: string | undefined): string | undefined;
/** 检查点链引用;scope 存在时按「会话 + 目录」分链,避免工作树之间互相覆盖。 */
export declare function checkpointRef(refPrefix: string, sid: string, scope?: string): string;
/** /rollback 的保存点引用(与检查点链同样按目录分链)。 */
export declare function saveRef(refPrefix: string, sid: string, scope?: string): string;
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
