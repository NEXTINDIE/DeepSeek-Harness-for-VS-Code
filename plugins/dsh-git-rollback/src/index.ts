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
import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";
import { checkpointTurn, checkpointTurnEnd } from "./checkpoint.js";
import { registerCommands } from "./command.js";
import { DEFAULT_COMMIT_PREFIX, DEFAULT_REF_PREFIX } from "./types.js";

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

export const name = "dsh-git-rollback";
export const inject = ["commands"];

export function apply(ctx: Context, config: RollbackConfig = {}) {
  if (config.enabled === false) return;
  const gitBin = typeof config.gitBin === "string" && config.gitBin.trim() ? config.gitBin.trim() : "git";
  const commitPrefix = typeof config.commitPrefix === "string" && config.commitPrefix.trim() ? config.commitPrefix.trim() : DEFAULT_COMMIT_PREFIX;
  const refPrefix = typeof config.refPrefix === "string" && config.refPrefix.trim() ? config.refPrefix.trim() : DEFAULT_REF_PREFIX;
  const opts = { gitBin, refPrefix, commitPrefix };

  // 每仓库串行化快照,避免并发 git 操作互相踩
  const queues = new Map<string, Promise<void>>();
  const enqueue = (cwd: string, task: () => Promise<void>): void => {
    const prev = queues.get(cwd) ?? Promise.resolve();
    const run = prev.then(task, task);
    queues.set(cwd, run.then(() => undefined, () => undefined));
  };

  ctx.on("session/event", (session: Session, event: SessionEvent) => {
    const data = event.data as { turn?: number };
    const turn = typeof data.turn === "number" ? data.turn : 0;
    if (!turn) return;
    const header = session.header;
    const sid = typeof session.id === "string" ? session.id : undefined;
    const cwd = typeof header.cwd === "string" && header.cwd ? header.cwd : undefined;
    const isTop = (header.delegationDepth ?? 0) === 0;
    if (!sid || !cwd || !isTop) return;
    if (event.type === "turn/start") {
      enqueue(cwd, () => checkpointTurn(gitBin, cwd, sid, turn, event.time, opts));
    } else if (event.type === "turn/end") {
      // 回合结束快照:记录该回合自身改动,供 /undo 精确撤销(只撤销会话改动,不动用户提交内容)
      enqueue(cwd, () => checkpointTurnEnd(gitBin, cwd, sid, turn, event.time, opts));
    }
  });

  registerCommands(ctx, opts);
}

// 注意:不要添加 default 导出。DSH 的 loader(cordis-plugin-loader 的
// `unwrapExports`)会优先取 `exports.default`,导致模块级 `inject`/`name`
// 具名导出被丢弃,`ctx.commands` 随之报 "cannot get property without inject"。
// 只保留具名导出时,loader 保留模块命名空间并正确读取 `inject`。
