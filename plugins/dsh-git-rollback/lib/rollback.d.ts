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
/** 解析 /rollback 的回合号参数:空 = 最近一回合。 */
export declare function parseTurnArg(rawInput: string): number | {
    error: string;
};
export declare function performRollback(gitBin: string, cwd: string, sid: string, rawInput: string, opts: RollbackOptions): Promise<CommandText>;
export declare function performRedo(gitBin: string, cwd: string, sid: string, opts: RollbackOptions): Promise<CommandText>;
export declare function listCheckpoints(gitBin: string, cwd: string, sid: string, opts: RollbackOptions): Promise<CommandText>;
