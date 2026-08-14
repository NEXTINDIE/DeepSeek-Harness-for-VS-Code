/**
 * dsh-git-rollback — DSH 回合级 Git 回退插件。
 *
 * 每个顶层会话(有 cwd、非子代理)的 turn/start 自动快照工作区到隐藏引用
 * `refs/dsh/checkpoints/<sid>`(检查点链,用户分支历史零污染);提供全局命令
 * `/rollback [N]`(非破坏性回退,先存保存点)、`/redo`、`/checkpoints`。
 * 记录文件 `<cwd>/.dsh/rollback/<sid>.json` 是重启后的持久层(会话日志自定义
 * 事件在当前构建无注册面,详见 types.ts 说明)。
 */
import type { Context } from "@deepseek-ai/cordis";
export interface RollbackConfig {
    /** 总开关;false 时插件不激活。 */
    enabled?: boolean;
    /** git 可执行文件路径或命令名,默认 "git"。 */
    gitBin?: string;
    /** 检查点提交信息前缀,默认 "dsh-checkpoint"。 */
    commitPrefix?: string;
    /** 隐藏引用命名空间前缀,默认 "refs/dsh"。 */
    refPrefix?: string;
}
export declare const name = "dsh-git-rollback";
export declare const inject: string[];
export declare function apply(ctx: Context, config?: RollbackConfig): void;
