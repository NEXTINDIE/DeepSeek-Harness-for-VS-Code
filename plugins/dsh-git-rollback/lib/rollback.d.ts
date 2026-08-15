export interface RollbackOptions {
    gitBin: string;
    refPrefix: string;
    commitPrefix: string;
}
export type CommandText = {
    kind: "success";
    text: string;
} | {
    kind: "error";
    text: string;
};
/** 解析 /rollback 参数:空 = 最近一回合;数字 = 回合号;40 位十六进制 = 直接指定检查点提交。 */
export declare function parseTurnArg(rawInput: string): number | {
    sha: string;
} | {
    error: string;
};
export declare function performRollback(gitBin: string, cwd: string, sid: string, rawInput: string, opts: RollbackOptions): Promise<CommandText>;
export declare function performRedo(gitBin: string, cwd: string, sid: string, opts: RollbackOptions): Promise<CommandText>;
/**
 * 精确撤销 /undo [N]:只撤销该会话某个回合自身产生的文件改动
 * (反向应用 diff(回合开始检查点 → 回合结束快照)),**不触碰你自己提交的内容**。
 * 回合结束后你自己手动改动的文件若与撤销补丁冲突,会明确报错并保留补丁供手动处理。
 */
export declare function performUndo(gitBin: string, cwd: string, sid: string, rawInput: string, opts: RollbackOptions): Promise<CommandText>;
export declare function listCheckpoints(gitBin: string, cwd: string, sid: string, opts: RollbackOptions): Promise<CommandText>;
