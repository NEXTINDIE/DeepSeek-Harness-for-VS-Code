import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as vscode from "vscode";

/**
 * 回合级 Git 回退(扩展侧只读部分)。
 *
 * 快照与回退执行全部由 DSH 服务端插件 `dsh-git-rollback` 负责
 * (/rollback /redo /checkpoints 命令,经 commands/execute 通道);
 * 扩展读取插件写入工作区的记录文件 `.dsh/rollback/<sessionId>.json`,
 * 并在回退前用 git diff 计算「代码审核」预览(逐文件增删行数 + 可展开差异),
 * 供 webview 弹窗确认。
 */

export interface RollbackCheckpoint {
  turn: number;
  commit: string;
  parent?: string;
  time: number;
  untracked: string[];
  truncated: boolean;
  /** v2.1:回合结束快照(/undo 精确撤销的依据);旧记录可能没有。 */
  after?: { commit: string; time: number };
}

export interface RollbackRecord {
  version: number;
  sessionId: string;
  cwd: string;
  updatedAt?: number;
  /** v2:checkpoints[](链式检查点);v1 兼容:turns[](旧记录,读取时归一化)。 */
  checkpoints: RollbackCheckpoint[];
  rolls: { turn: number; to: string; redo: string; removed: number; time: number }[];
}

/** 回退预览里的一行文件差异(相对检查点,工作区的当前改动)。 */
export interface RollbackFileStat {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
  /** A=新增 D=删除(文本可由 numstat 推断;二进制文件需 --name-status 判定)。 */
  status?: "A" | "D" | "M";
}

export interface RollbackPreview {
  turn: number;
  time: number;
  commit: string;
  files: RollbackFileStat[];
  addedTotal: number;
  deletedTotal: number;
  /** 回退将删除的新建未跟踪文件(当前未跟踪 ∖ 检查点清单)。 */
  removedUntracked: string[];
  /** 未跟踪清单不可用(检查点记录截断)时为 true。 */
  untrackedUnknown: boolean;
  truncated: boolean;
}

export interface CheckpointSummary {
  turn: number;
  time: number;
  commit: string;
  files: RollbackFileStat[];
  addedTotal: number;
  deletedTotal: number;
  truncated: boolean;
  /** 是否有回合结束快照(/undo 精确撤销可用)。 */
  hasAfter: boolean;
}

const RECORD_DIR = ".dsh/rollback";
const MAX_PREVIEW_FILES = 300;
const MAX_DIFF_CHARS = 60_000;

/** 与服务端插件一致的记录文件名清理规则(跨进程契约)。 */
export function sanitizeRecordName(value: string): string {
  const s = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return s || "x";
}

export function recordFilePath(cwd: string, sessionId: string): string {
  return join(cwd, RECORD_DIR, `${sanitizeRecordName(sessionId)}.json`);
}

/** 读取某会话的回合检查点记录;v1(turns[])自动归一化;缺失或损坏时返回 undefined。 */
export async function loadRollbackRecord(cwd: string, sessionId: string): Promise<RollbackRecord | undefined> {
  try {
    const raw = await readFile(recordFilePath(cwd, sessionId), "utf8");
    const value = JSON.parse(raw) as RollbackRecord & { turns?: { turn?: number; commit?: string; time?: number }[] };
    if (!value || typeof value !== "object") return undefined;
    if (!Array.isArray(value.checkpoints) && Array.isArray(value.turns)) {
      value.checkpoints = value.turns.map((t) => ({
        turn: typeof t?.turn === "number" ? t.turn : 0,
        commit: String(t?.commit ?? ""),
        time: typeof t?.time === "number" ? t.time : 0,
        untracked: [],
        truncated: true,
      }));
    }
    if (!Array.isArray(value.checkpoints)) return undefined;
    value.checkpoints = value.checkpoints.filter(
      (c) => !!c && typeof c.turn === "number" && typeof c.commit === "string" && c.commit.length > 0,
    );
    value.checkpoints.sort((a, b) => a.turn - b.turn);
    value.rolls = Array.isArray(value.rolls) ? value.rolls : [];
    return value;
  } catch {
    return undefined;
  }
}

/** 优先使用 VS Code 内置 git 扩展提供的可执行路径,回退 PATH 上的 git。 */
function resolveGitPath(): string {
  try {
    const gitExt = vscode.extensions.getExtension<{ getAPI(version: 1): { git: { path: string } } }>("vscode.git");
    const path = gitExt?.exports?.getAPI(1)?.git?.path;
    if (path) return path;
  } catch {
    // 内置 git 扩展不可用时回退 PATH
  }
  return "git";
}

function gitExec(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // core.quotepath=false:中文等非 ASCII 路径在 diff/status 输出中保持原始 UTF-8,
    // 避免解析出的路径是 "\346\265\213..." 转义串而无法用于后续 diff/apply。
    execFile(
      resolveGitPath(),
      ["-c", "core.quotepath=false", ...args],
      { cwd, timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? "").trim(),
        });
      },
    );
  });
}

/** 解析 `git diff --numstat` 输出为文件行数列表(工作区相对 commit 的改动)。 */
function parseNumstat(
  stdout: string,
  nameStatus?: Map<string, "A" | "D" | "M">,
): { files: RollbackFileStat[]; addedTotal: number; deletedTotal: number; truncated: boolean } {
  const files: RollbackFileStat[] = [];
  let addedTotal = 0;
  let deletedTotal = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const path = parts.slice(2).join("\t");
    const binary = parts[0] === "-" || parts[1] === "-";
    const added = binary ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deleted = binary ? 0 : Number.parseInt(parts[1], 10) || 0;
    // 状态判定:二进制文件 numstat 无行数,须借助 --name-status;
    // 文本文件按 新增(added>0,deleted=0)/删除(added=0,deleted>0) 推断,修改为 M。
    let status: "A" | "D" | "M" | undefined = nameStatus?.get(path);
    if (!status) {
      if (added > 0 && deleted === 0) status = "A";
      else if (added === 0 && deleted > 0) status = "D";
      else status = "M";
    }
    addedTotal += added;
    deletedTotal += deleted;
    files.push({ path, added, deleted, binary, status });
    if (files.length >= MAX_PREVIEW_FILES) return { files, addedTotal, deletedTotal, truncated: true };
  }
  return { files, addedTotal, deletedTotal, truncated: false };
}

/** git diff --name-status <commit>[ <commit2>] -- 的 A/D/M 映射(区分二进制文件的新增/删除)。 */
async function diffNameStatus(cwd: string, commit: string, commit2?: string): Promise<Map<string, "A" | "D" | "M">> {
  const args = ["diff", "--name-status", commit, ...(commit2 ? [commit2] : []), "--"];
  const res = await gitExec(cwd, args);
  const map = new Map<string, "A" | "D" | "M">();
  if (!res.ok) return map;
  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const code = line.slice(0, tab);
    const path = line.slice(tab + 1);
    if (code === "A" || code === "D" || code === "M") map.set(path, code);
  }
  return map;
}

/** 当前未跟踪文件清单(与服务端插件一致:排除 ignored 与记录目录)。 */
async function currentUntracked(cwd: string): Promise<string[]> {
  const res = await gitExec(cwd, ["ls-files", "-o", "--exclude-standard", "--exclude=.dsh/rollback"]);
  if (!res.ok) return [];
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/** 相对任意检查点提交构造回退预览(逐文件增删行数 + 将删除的新建未跟踪文件)。 */
async function previewFromCommit(
  cwd: string,
  commit: string,
  untracked: string[],
  truncated: boolean,
  turn: number,
  time: number,
): Promise<RollbackPreview | undefined> {
  const diff = await gitExec(cwd, ["diff", "--numstat", commit, "--"]);
  if (!diff.ok) return undefined;
  const [nameStatus] = await Promise.all([diffNameStatus(cwd, commit)]);
  const stats = parseNumstat(diff.stdout, nameStatus);
  const current = await currentUntracked(cwd);
  const manifest = new Set(untracked ?? []);
  const removedUntracked = truncated ? [] : current.filter((f) => !manifest.has(f));
  return {
    turn,
    time,
    commit,
    files: stats.files,
    addedTotal: stats.addedTotal,
    deletedTotal: stats.deletedTotal,
    removedUntracked: removedUntracked.slice(0, 200),
    untrackedUnknown: truncated,
    truncated: stats.truncated || removedUntracked.length > 200,
  };
}

/**
 * 回退前的「代码审核」预览:工作区相对目标检查点的逐文件差异
 * (这些改动将在回退时被撤销),以及将被删除的新建未跟踪文件。
 */
export async function rollbackPreview(cwd: string, record: RollbackRecord, turn?: number): Promise<RollbackPreview | undefined> {
  const entry = typeof turn === "number" ? record.checkpoints.find((c) => c.turn === turn) : record.checkpoints[record.checkpoints.length - 1];
  if (!entry) return undefined;
  return previewFromCommit(cwd, entry.commit, entry.untracked ?? [], !!entry.truncated, entry.turn, entry.time);
}

/**
 * 分叉分隔线「还原检查点」兜底预览:相对父会话某回合的**结束快照**(after)的差异
 * —— 即分叉点(子会话创建前)的工作区状态;经 /rollback <sha> 恢复。
 */
export async function forkAfterPreview(cwd: string, entry: RollbackCheckpoint): Promise<RollbackPreview | undefined> {
  if (!entry.after) return undefined;
  return previewFromCommit(cwd, entry.after.commit, entry.untracked ?? [], !!entry.truncated, entry.turn, entry.after.time);
}

/** 单个文件的完整差异文本(点击展开时按需获取)。 */
export async function rollbackFileDiff(cwd: string, commit: string, path: string): Promise<string | undefined> {
  const res = await gitExec(cwd, ["diff", "--no-color", commit, "--", path]);
  if (!res.ok) return undefined;
  const text = res.stdout.length > MAX_DIFF_CHARS ? `${res.stdout.slice(0, MAX_DIFF_CHARS)}\n…(差异过长,已截断)` : res.stdout;
  return text || undefined;
}

/** 检查点版本的文件内容(git show commit:path;文件在检查点中不存在时返回空串,供 diff 视图作全新增展示)。 */
export async function gitShowContent(cwd: string, commit: string, path: string): Promise<string> {
  const res = await gitExec(cwd, ["show", `${commit}:${path}`]);
  if (!res.ok) return "";
  return res.stdout;
}

/** 找到包含该路径的 git 仓库根(向上查找 .git);不是仓库时返回 null。 */
function findGitRoot(startDir: string): string | null {
  let d = startDir;
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(d, ".git"))) return d;
    const parent = dirname(d);
    if (parent === d) return null;
    d = parent;
  }
  return null;
}

/**
 * 产物文件若位于 git 仓库且已被跟踪:返回其 `git:` HEAD URI
 * (scheme 与 VS Code 内置 git 扩展的 GitUri 一致),供 vscode.diff 打开「HEAD → 工作树」差异;
 * 未跟踪/非仓库文件返回 undefined。
 */
export async function gitHeadUriForFile(filePath: string): Promise<vscode.Uri | undefined> {
  const repoRoot = findGitRoot(dirname(filePath));
  if (!repoRoot) return undefined;
  const rel = filePath.slice(repoRoot.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
  const res = await gitExec(repoRoot, ["ls-files", "--error-unmatch", "--", rel]);
  if (!res.ok) return undefined;
  return vscode.Uri.file(filePath).with({
    scheme: "git",
    query: JSON.stringify({ path: filePath, ref: "HEAD" }),
  });
}

/** 检查点清单:每个检查点相对当前工作区的差异概览(文件数、增删行数)。 */
export async function checkpointSummaries(cwd: string, record: RollbackRecord): Promise<{ head: string; dirty: number; checkpoints: CheckpointSummary[] }> {
  const head = await gitExec(cwd, ["rev-parse", "--short", "HEAD"]);
  const status = await gitExec(cwd, ["status", "--porcelain"]);
  const dirty = status.ok ? status.stdout.split(/\r?\n/).filter(Boolean).length : 0;
  const list: CheckpointSummary[] = [];
  for (const entry of [...record.checkpoints].slice(-20)) {
    const diff = await gitExec(cwd, ["diff", "--numstat", entry.commit, "--"]);
    const nameStatus = await diffNameStatus(cwd, entry.commit);
    const stats = diff.ok ? parseNumstat(diff.stdout, nameStatus) : { files: [], addedTotal: 0, deletedTotal: 0, truncated: false };
    list.push({
      turn: entry.turn,
      time: entry.time,
      commit: entry.commit,
      files: stats.files,
      addedTotal: stats.addedTotal,
      deletedTotal: stats.deletedTotal,
      truncated: stats.truncated || entry.truncated,
      hasAfter: !!entry.after,
    });
  }
  return { head: head.stdout, dirty, checkpoints: list.reverse() };
}

/** 跨会话检查点清单:扫描工作区 .dsh/rollback 下全部会话记录(用户可在任意对话中撤销别的对话产生的改动)。 */
export async function allCheckpointSummaries(
  cwd: string,
): Promise<{ head: string; dirty: number; sessions: { sessionId: string; checkpoints: CheckpointSummary[] }[] }> {
  const head = await gitExec(cwd, ["rev-parse", "--short", "HEAD"]);
  const status = await gitExec(cwd, ["status", "--porcelain"]);
  const dirty = status.ok ? status.stdout.split(/\r?\n/).filter(Boolean).length : 0;
  const sessions: { sessionId: string; checkpoints: CheckpointSummary[] }[] = [];
  try {
    const { readdir } = await import("node:fs/promises");
    const dir = join(cwd, RECORD_DIR);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const sessionId = file.slice(0, -5);
      const record = await loadRollbackRecord(cwd, sessionId);
      if (!record) continue;
      const summary = await checkpointSummaries(cwd, record);
      sessions.push({ sessionId, checkpoints: summary.checkpoints });
    }
  } catch {
    // 目录不存在或不可读:返回空
  }
  sessions.sort((a, b) => (b.checkpoints[b.checkpoints.length - 1]?.time ?? 0) - (a.checkpoints[a.checkpoints.length - 1]?.time ?? 0));
  return { head: head.stdout, dirty, sessions };
}

/** /undo 精确撤销的预览:该回合自身产生的改动 = diff(回合开始检查点 → 回合结束快照)。 */
export async function scopedTurnStats(
  cwd: string,
  record: RollbackRecord,
  turn?: number,
): Promise<{ turn: number; time: number; before: string; after: string; files: RollbackFileStat[]; addedTotal: number; deletedTotal: number; truncated: boolean } | undefined> {
  const entry = typeof turn === "number" ? record.checkpoints.find((c) => c.turn === turn) : undefined;
  // 明确指定回合但记录里没有该回合 → 返回 undefined(提示该回合无检查点),
  // 绝不 fallback 到其他回合——否则点击 A/B 分隔线会错误显示最后一个回合的改动。
  if (typeof turn === "number" && !entry) return undefined;
  const candidate = entry ?? [...record.checkpoints].reverse().find((c) => c.after);
  if (!candidate || !candidate.after) return undefined;
  const diff = await gitExec(cwd, ["diff", "--numstat", candidate.commit, candidate.after.commit, "--"]);
  if (!diff.ok) return undefined;
  const nameStatus = await diffNameStatus(cwd, candidate.commit, candidate.after.commit);
  const stats = parseNumstat(diff.stdout, nameStatus);
  return {
    turn: candidate.turn,
    time: candidate.time,
    before: candidate.commit,
    after: candidate.after.commit,
    files: stats.files,
    addedTotal: stats.addedTotal,
    deletedTotal: stats.deletedTotal,
    truncated: stats.truncated,
  };
}

/** /undo 预览里单个文件的完整差异(回合开始 → 回合结束)。 */
export async function scopedTurnFileDiff(cwd: string, before: string, after: string, path: string): Promise<string | undefined> {
  const res = await gitExec(cwd, ["diff", "--no-color", before, after, "--", path]);
  if (!res.ok) return undefined;
  const text = res.stdout.length > MAX_DIFF_CHARS ? `${res.stdout.slice(0, MAX_DIFF_CHARS)}\n…(差异过长,已截断)` : res.stdout;
  return text || undefined;
}
