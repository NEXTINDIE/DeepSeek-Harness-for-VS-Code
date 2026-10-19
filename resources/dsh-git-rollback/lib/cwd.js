/**
 * 生效工作目录解析(0.2.1+ 的 working-directory 服务)。
 *
 * 为什么不能用 `session.header.cwd`:会话头记录的是**创建时的项目目录且永不改变**;
 * 0.2.1 起 Agent 可以用 `working_directory` 工具切换目录,实验性 Git Worktrees 插件
 * (`create_worktree`)**最后一步就是把会话目录切进新的工作树**。
 * 若继续按 header.cwd 快照,Agent 在工作树里的改动不会被任何检查点捕获 ——
 * 「还原检查点」会变成静默的空操作。
 *
 * 因此所有快照/回退/命令/网页路由统一走这里:
 *  - cwd     = 生效目录(有 workingDirectory 服务就用它,否则回退 header.cwd)
 *  - header  = 会话头目录(用于判断是否需要给引用加作用域)
 *  - scope   = cwd ≠ header 时的稳定令牌,让检查点链与保存点按目录分链
 *              (Git 工作树共享同一个 .git,custom ref 是仓库级的,不分链会互相覆盖)
 */
import { cwdScope } from "./git.js";
export function resolveCwd(host, session) {
    const headerCwd = typeof session?.header?.cwd === "string" && session.header.cwd ? session.header.cwd : undefined;
    let cwd = headerCwd;
    try {
        const service = host?.get?.("workingDirectory");
        const effective = typeof service?.get === "function" ? service.get(session) : undefined;
        if (typeof effective === "string" && effective)
            cwd = effective;
    }
    catch {
        // 服务缺失或抛错(老宿主 / 目录已被删除):回退到会话头目录
    }
    if (!cwd)
        return { headerCwd };
    return { cwd, headerCwd, scope: cwdScope(cwd, headerCwd) };
}
