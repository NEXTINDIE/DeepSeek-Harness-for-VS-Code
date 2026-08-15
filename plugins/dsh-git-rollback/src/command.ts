/**
 * 命令注册:/rollback [N] /redo /checkpoints(全局命令,web 命令面板与
 * VSCode 聊天面板共用;commands/execute 通道)。
 */
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandDefinition, CommandInvocation } from "@deepseek-ai/dsh-commands";
import { listCheckpoints, performRedo, performRollback, performUndo, type RollbackOptions } from "./rollback.js";

interface SessionHeaderView {
  cwd?: string;
  delegationDepth?: number;
}

interface SessionView {
  id?: string;
  header?: SessionHeaderView;
}

/** 从命令调用上下文解析会话/工作区事实(仅读叶子字段)。 */
function sessionInfo(invocation: CommandInvocation): { sid?: string; cwd?: string; isTop: boolean; running: boolean } {
  const agent = invocation.agent as Agent | undefined;
  const session = agent?.session as unknown as SessionView | undefined;
  const header = session?.header;
  return {
    sid: session?.id,
    cwd: typeof header?.cwd === "string" && header.cwd ? header.cwd : undefined,
    isTop: (header?.delegationDepth ?? 0) === 0,
    running: agent?.status === "running",
  };
}

export function registerCommands(ctx: Context, opts: RollbackOptions): void {
  const rollbackDef: CommandDefinition = {
    name: "rollback",
    description: "把工作区回退到某回合开始前的状态(非破坏性:先存保存点,/redo 可恢复)",
    input: { hint: "[N]" },
    async handler(invocation) {
      const info = sessionInfo(invocation);
      if (!info.cwd || !info.sid) return { kind: "error", text: "当前会话没有工作目录,无法回退" };
      if (info.running) return { kind: "error", text: "回合正在运行中,请等它结束后再回退" };
      return performRollback(opts.gitBin, info.cwd, info.sid, invocation.rawInput, opts);
    },
  };

  const redoDef: CommandDefinition = {
    name: "redo",
    description: "恢复最近一次 /rollback 前的完整状态(含未跟踪文件)",
    async handler(invocation) {
      const info = sessionInfo(invocation);
      if (!info.cwd || !info.sid) return { kind: "error", text: "当前会话没有工作目录,无法重做" };
      if (info.running) return { kind: "error", text: "回合正在运行中,请等它结束后再操作" };
      return performRedo(opts.gitBin, info.cwd, info.sid, opts);
    },
  };

  const undoDef: CommandDefinition = {
    name: "undo",
    description: "精确撤销某回合产生的文件改动(反向应用回合开始→结束的差异,不动你自己提交的内容)",
    input: { hint: "[N]" },
    async handler(invocation) {
      const info = sessionInfo(invocation);
      if (!info.cwd || !info.sid) return { kind: "error", text: "当前会话没有工作目录,无法撤销" };
      if (info.running) return { kind: "error", text: "回合正在运行中,请等它结束后再撤销" };
      return performUndo(opts.gitBin, info.cwd, info.sid, invocation.rawInput, opts);
    },
  };

  const checkpointsDef: CommandDefinition = {
    name: "checkpoints",
    description: "列出本会话的回合检查点与清理指引",
    async handler(invocation) {
      const info = sessionInfo(invocation);
      if (!info.cwd || !info.sid) return { kind: "error", text: "当前会话没有工作目录" };
      return listCheckpoints(opts.gitBin, info.cwd, info.sid, opts);
    },
  };

  ctx.effect(() => ctx.commands.register(rollbackDef), "cmd /rollback");
  ctx.effect(() => ctx.commands.register(redoDef), "cmd /redo");
  ctx.effect(() => ctx.commands.register(undoDef), "cmd /undo");
  ctx.effect(() => ctx.commands.register(checkpointsDef), "cmd /checkpoints");
}
