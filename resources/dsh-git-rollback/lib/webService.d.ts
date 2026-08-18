/**
 * 网页端「还原检查点」的 host 半:注册两条 HTTP 路由,供网页端 client 半
 * (dsh-git-rollback/client)调用 —— 预览某回合自身改动、执行 /undo N。
 *
 *  - POST /dsh-rollback/preview  body {sessionId, turn}
 *    → 读 .dsh/rollback/<sid>.json 记录,git diff --numstat 回合开始→结束,
 *      返回 {files:[{path,added,deleted,binary}], addedTotal, deletedTotal}
 *  - POST /dsh-rollback/apply     body {sessionId, turn}
 *    → 经 commands.execute 执行 "/undo N"(与 VS Code 扩展同一通道),
 *      返回 {ok, text}
 *
 * 设计:client 半零 DSH 依赖(纯 fetch + react),不引入 typert/remote 注册;
 * 路由走 webServer 服务,与网页端同源。
 */
import type { Context } from "@deepseek-ai/cordis";
export interface WebRollbackOptions {
    gitBin: string;
}
/** 注册网页端路由;返回 disposer。 */
export declare function registerWebRoutes(ctx: Context, opts: WebRollbackOptions): () => void;
