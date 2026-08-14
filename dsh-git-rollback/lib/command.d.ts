/**
 * 命令注册:/rollback [N] /redo /checkpoints(全局命令,web 命令面板与
 * VSCode 聊天面板共用;commands/execute 通道)。
 */
import type { Context } from "@deepseek-ai/cordis";
import { type RollbackOptions } from "./rollback.js";
export declare function registerCommands(ctx: Context, opts: RollbackOptions): void;
