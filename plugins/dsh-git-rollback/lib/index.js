import { checkpointTurn, checkpointTurnEnd } from "./checkpoint.js";
import { registerCommands } from "./command.js";
import { DEFAULT_COMMIT_PREFIX, DEFAULT_REF_PREFIX } from "./types.js";
export const name = "dsh-git-rollback";
export const inject = ["commands"];
export function apply(ctx, config = {}) {
    if (config.enabled === false)
        return;
    const gitBin = typeof config.gitBin === "string" && config.gitBin.trim() ? config.gitBin.trim() : "git";
    const commitPrefix = typeof config.commitPrefix === "string" && config.commitPrefix.trim() ? config.commitPrefix.trim() : DEFAULT_COMMIT_PREFIX;
    const refPrefix = typeof config.refPrefix === "string" && config.refPrefix.trim() ? config.refPrefix.trim() : DEFAULT_REF_PREFIX;
    const opts = { gitBin, refPrefix, commitPrefix };
    // 每仓库串行化快照,避免并发 git 操作互相踩
    const queues = new Map();
    const enqueue = (cwd, task) => {
        const prev = queues.get(cwd) ?? Promise.resolve();
        const run = prev.then(task, task);
        queues.set(cwd, run.then(() => undefined, () => undefined));
    };
    ctx.on("session/event", (session, event) => {
        const data = event.data;
        const turn = typeof data.turn === "number" ? data.turn : 0;
        if (!turn)
            return;
        const header = session.header;
        const sid = typeof session.id === "string" ? session.id : undefined;
        const cwd = typeof header.cwd === "string" && header.cwd ? header.cwd : undefined;
        const isTop = (header.delegationDepth ?? 0) === 0;
        if (!sid || !cwd || !isTop)
            return;
        if (event.type === "turn/start") {
            enqueue(cwd, () => checkpointTurn(gitBin, cwd, sid, turn, event.time, opts));
        }
        else if (event.type === "turn/end") {
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
