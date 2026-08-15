/**
 * git 执行封装:execFile Promise 化 + 常用子命令与记录文件 IO。
 * 真实插件运行在 dsh 宿主进程内,直接使用 node:child_process。
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_UNTRACKED, RECORD_DIR, } from "./types.js";
export function gitExec(gitBin, cwd, args, opts = {}) {
    return new Promise((resolve) => {
        // core.quotepath=false:非 ASCII 路径(中文等)在 diff/status/ls-files 输出中
        // 保持原始 UTF-8,不被转义成 "\346\265\213..." —— 否则解析出的路径无法
        // 用于后续 diff/apply(报"差异不可用"/"工作区不一致")。
        const child = spawn(gitBin, ["-c", "core.quotepath=false", ...args], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        const stdout = [];
        const stderr = [];
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, opts.timeoutMs ?? 30000);
        child.stdout.on("data", (d) => stdout.push(d));
        child.stderr.on("data", (d) => stderr.push(d));
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({ ok: false, stdout: "", stderr: String(err) });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            const raw = Buffer.concat(stdout).toString("utf8");
            resolve({
                ok: code === 0 && !timedOut,
                stdout: opts.trim === false ? raw : raw.trim(),
                stderr: Buffer.concat(stderr).toString("utf8").trim(),
            });
        });
        if (opts.stdin !== undefined)
            child.stdin.write(opts.stdin, "utf8");
        child.stdin.end();
    });
}
/** commit-tree 的身份兜底:缺失 user.name/email 时以插件身份重试。(-c 必须在子命令之前) */
export async function commitTree(gitBin, cwd, tree, parent, message) {
    const args = ["-c", "commit.gpgsign=false", "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message];
    const first = await gitExec(gitBin, cwd, args);
    if (first.ok)
        return first;
    return gitExec(gitBin, cwd, [
        "-c", "user.name=dsh-checkpoint", "-c", "user.email=dsh-checkpoint@localhost",
        "-c", "commit.gpgsign=false", "commit-tree", tree,
        ...(parent ? ["-p", parent] : []), "-m", message,
    ]);
}
export function sanitizeRefPart(value) {
    const s = String(value).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    return s || "x";
}
export function shortHash(hash) {
    return String(hash).slice(0, 8);
}
export function checkpointRef(refPrefix, sid) {
    return `${refPrefix}/checkpoints/${sanitizeRefPart(sid)}`;
}
export function saveRef(refPrefix, sid) {
    return `${refPrefix}/saves/${sanitizeRefPart(sid)}`;
}
export function recordPath(cwd, sid) {
    return join(cwd, RECORD_DIR, `${sanitizeRefPart(sid)}.json`);
}
/** 当前未跟踪文件清单(相对路径,排除 ignored 与插件自己的 .dsh/rollback 记录;超限截断)。 */
export async function untrackedList(gitBin, cwd) {
    const res = await gitExec(gitBin, cwd, ["ls-files", "-o", "--exclude-standard", "--exclude=.dsh/rollback"]);
    if (!res.ok)
        return { files: [], truncated: false };
    const files = res.stdout.length > 0 ? res.stdout.split(/\r?\n/) : [];
    if (files.length > MAX_UNTRACKED)
        return { files: files.slice(0, MAX_UNTRACKED), truncated: true };
    return { files, truncated: false };
}
/** 删除工作区内的单个相对路径(仅文件;路径经安全校验)。 */
export async function rmPath(cwd, rel) {
    const normalized = rel.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.split("/").includes(".."))
        return;
    try {
        rmSync(join(cwd, rel), { force: true });
    }
    catch {
        // 删除失败不阻塞回退主流程
    }
}
/** 读取记录文件;兼容 v1(turns[])自动迁移为 v2(checkpoints[])。 */
export function readRecord(cwd, sid) {
    try {
        const raw = readFileSync(recordPath(cwd, sid), "utf8");
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object")
            return undefined;
        if (!Array.isArray(value.checkpoints) && Array.isArray(value.turns)) {
            // v1 旧记录:检查点无父链,精确清理不可用(标记截断,回退时跳过清理)
            value.checkpoints = value.turns.map((t) => ({
                turn: typeof t?.turn === "number" ? t.turn : 0,
                commit: String(t?.commit ?? ""),
                time: typeof t?.time === "number" ? t.time : 0,
                untracked: [],
                truncated: true,
            }));
            value.version = 2;
        }
        if (!Array.isArray(value.checkpoints))
            return undefined;
        const record = {
            version: 2,
            sessionId: String(value.sessionId ?? sid),
            cwd: String(value.cwd ?? cwd),
            updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
            checkpoints: value.checkpoints.filter((c) => !!c && typeof c.turn === "number" && typeof c.commit === "string" && c.commit.length > 0),
            rolls: Array.isArray(value.rolls)
                ? value.rolls.filter((r) => !!r && typeof r.to === "string" && typeof r.redo === "string")
                : [],
            undos: Array.isArray(value.undos)
                ? value.undos.filter((u) => !!u && typeof u.turn === "number")
                : [],
        };
        return record;
    }
    catch {
        return undefined;
    }
}
export function writeRecord(cwd, sid, record) {
    try {
        mkdirSync(join(cwd, RECORD_DIR), { recursive: true });
        writeFileSync(recordPath(cwd, sid), JSON.stringify(record, null, 2), "utf8");
    }
    catch (error) {
        console.error("[dsh-git-rollback] record write failed:", error);
    }
}
