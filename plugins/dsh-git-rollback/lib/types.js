/**
 * 记录文件与 git 对象的共享类型(插件与 VSCode 扩展的联动契约)。
 *
 * 说明:计划原定的会话日志事件(git-checkpoint / git/rollback / git/redo,
 * `ignorable: true`)在当前 rc.6 构建无法安全实现——`Session.append()` 不接受
 * `ignorable` 标记,且 `dsh-session` 的 known-event-types 目录明确写着
 * "a registration surface for them is deferred until such a consumer exists";
 * 未标记的自定义事件会让持久化读取路径在重启后拒绝整个会话日志。
 * 因此持久化落在工作区 `.dsh/rollback/<sessionId>.json`(重启后仍在)+
 * 隐藏 git ref(refs/dsh/*,gc 不可回收),检查点链可随时从 ref + 提交父链重建。
 */
export const RECORD_DIR = ".dsh/rollback";
export const DEFAULT_REF_PREFIX = "refs/dsh";
export const DEFAULT_COMMIT_PREFIX = "dsh-checkpoint";
export const MAX_CHECKPOINTS = 100;
export const MAX_ROLLS = 20;
export const MAX_UNTRACKED = 1000;
