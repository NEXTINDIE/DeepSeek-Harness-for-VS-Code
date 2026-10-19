/**
 * Git 工作树信息(0.2.1 实验性 Git Worktrees 插件把会话切进独立 checkout 后,
 * 界面需要一个可视化入口:分支、路径、在资源管理器里定位)。
 *
 * 只读:全部用 git rev-parse 取值,不改动仓库;非 git 目录、git 不可用时返回 undefined。
 */
import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export interface WorktreeInfo {
  /** 工作树根目录(生效工作目录)。 */
  path: string;
  /** 当前分支名;detached HEAD 时为短 sha。 */
  branch?: string;
  /** 是否为 linked worktree(不是主检出)。 */
  isWorktree: boolean;
  /** 共享的 .git 目录(链接工作树指向主检出的 .git)。 */
  commonDir?: string;
}

function git(args: string[], cwd: string, gitBin = "git"): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(gitBin, args, { cwd, windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

/** 解析某个目录所属的工作树;非 git 目录返回 undefined。 */
export async function resolveWorktree(cwd: string, gitBin = "git"): Promise<WorktreeInfo | undefined> {
  const top = await git(["rev-parse", "--show-toplevel"], cwd, gitBin);
  if (!top) return undefined;
  const [gitDir, commonDir, branch, sha] = await Promise.all([
    git(["rev-parse", "--absolute-git-dir"], cwd, gitBin),
    git(["rev-parse", "--git-common-dir"], cwd, gitBin),
    git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, gitBin),
    git(["rev-parse", "--short", "HEAD"], cwd, gitBin),
  ]);
  // 注意:`--absolute-git-dir` 是绝对路径,而 `--git-common-dir` 在主检出里返回**相对**的 ".git",
  // 直接比较会把每个普通仓库都判成 linked worktree。两者都要先解析成绝对路径再比。
  const absolute = (p?: string): string | undefined => {
    if (!p) return undefined;
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    return abs.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  };
  const gitDirAbs = absolute(gitDir);
  const commonAbs = absolute(commonDir);
  // 链接工作树的 git-dir 形如 <主检出>/.git/worktrees/<name>,与 common-dir 不同
  const isWorktree = !!gitDirAbs && !!commonAbs && gitDirAbs !== commonAbs;
  return {
    path: top,
    branch: branch && branch !== "HEAD" ? branch : sha,
    isWorktree,
    commonDir: commonAbs,
  };
}
