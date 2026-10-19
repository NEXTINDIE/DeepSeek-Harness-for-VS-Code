import { resolveCwd } from "./cwd.js";
import { listCheckpoints, performRedo, performRollback, performUndo } from "./rollback.js";
/** 从命令调用上下文解析会话/工作区事实(仅读叶子字段)。 */
function sessionInfo(ctx, invocation) {
    const agent = invocation.agent;
    const session = agent?.session;
    const header = session?.header;
    // 与快照侧同一套解析:生效目录 + 引用作用域(工作树切换后命令要落到同一个链上)
    const resolved = resolveCwd(ctx, session);
    return {
        sid: session?.id,
        cwd: resolved.cwd,
        scope: resolved.scope,
        isTop: (header?.delegationDepth ?? 0) === 0,
        running: agent?.status === "running",
    };
}
/** 按解析结果给本次命令补上作用域(与会话头目录一致时保持旧引用名)。 */
function withScope(opts, scope) {
    return scope ? { ...opts, scope } : opts;
}
export function registerCommands(ctx, opts) {
    const rollbackDef = {
        name: "rollback",
        description: "把工作区回退到某回合开始前的状态(非破坏性:先存保存点,/redo 可恢复;也可直接指定检查点提交)",
        input: { hint: "[N | <commit>]" },
        async handler(invocation) {
            const info = sessionInfo(ctx, invocation);
            if (!info.cwd || !info.sid)
                return { kind: "error", text: "当前会话没有工作目录,无法回退" };
            if (info.running)
                return { kind: "error", text: "回合正在运行中,请等它结束后再回退" };
            return performRollback(opts.gitBin, info.cwd, info.sid, invocation.rawInput, withScope(opts, info.scope));
        },
    };
    const redoDef = {
        name: "redo",
        description: "恢复最近一次 /rollback 前的完整状态(含未跟踪文件)",
        async handler(invocation) {
            const info = sessionInfo(ctx, invocation);
            if (!info.cwd || !info.sid)
                return { kind: "error", text: "当前会话没有工作目录,无法重做" };
            if (info.running)
                return { kind: "error", text: "回合正在运行中,请等它结束后再操作" };
            return performRedo(opts.gitBin, info.cwd, info.sid, withScope(opts, info.scope));
        },
    };
    const undoDef = {
        name: "undo",
        description: "精确撤销某回合产生的文件改动(反向应用回合开始→结束的差异,不动你自己提交的内容)",
        input: { hint: "[N]" },
        async handler(invocation) {
            const info = sessionInfo(ctx, invocation);
            if (!info.cwd || !info.sid)
                return { kind: "error", text: "当前会话没有工作目录,无法撤销" };
            if (info.running)
                return { kind: "error", text: "回合正在运行中,请等它结束后再撤销" };
            return performUndo(opts.gitBin, info.cwd, info.sid, invocation.rawInput, withScope(opts, info.scope));
        },
    };
    const checkpointsDef = {
        name: "checkpoints",
        description: "列出本会话的回合检查点与清理指引",
        async handler(invocation) {
            const info = sessionInfo(ctx, invocation);
            if (!info.cwd || !info.sid)
                return { kind: "error", text: "当前会话没有工作目录" };
            return listCheckpoints(opts.gitBin, info.cwd, info.sid, withScope(opts, info.scope));
        },
    };
    ctx.effect(() => ctx.commands.register(rollbackDef), "cmd /rollback");
    ctx.effect(() => ctx.commands.register(redoDef), "cmd /redo");
    ctx.effect(() => ctx.commands.register(undoDef), "cmd /undo");
    ctx.effect(() => ctx.commands.register(checkpointsDef), "cmd /checkpoints");
}
