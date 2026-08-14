/**
 * 回退引擎:非破坏性的 /rollback [N] 与 /redo。
 *
 * /rollback:保存点(add -A → commit-tree -p HEAD → refs/dsh/saves/<sid>)→
 *   reset --hard 目标检查点 → 精确清理「当前未跟踪 ∖ 检查点清单」的文件
 *   (ignored 永不触碰;清单截断时跳过清理并提示)。
 * /redo:reset --hard 保存点 + 对称清理。任何提交/文件状态都不丢失:
 *   用户提交仍在保存点父链与 reflog;回退前的未跟踪文件在保存点提交树内。
 */
import { gitExec, readRecord, rmPath, saveRef, shortHash, untrackedList, writeRecord } from "./git.js";
import { MAX_ROLLS } from "./types.js";
/** 解析 /rollback 的回合号参数:空 = 最近一回合。 */
export function parseTurnArg(rawInput) {
    const raw = rawInput.trim();
    if (raw === "")
        return Number.NaN; // 调用方以 NaN 表示「最近」
    if (!/^\d+$/.test(raw))
        return { error: `无效的回合号:「${raw}」` };
    const n = Number.parseInt(raw, 10);
    return Number.isSafeInteger(n) ? n : { error: `无效的回合号:「${raw}」` };
}
export async function performRollback(gitBin, cwd, sid, rawInput, opts) {
    const parsed = parseTurnArg(rawInput);
    if (typeof parsed === "object")
        return { kind: "error", text: parsed.error };
    const top = await gitExec(gitBin, cwd, ["rev-parse", "--show-toplevel"]);
    if (!top.ok || !top.stdout)
        return { kind: "error", text: "工作区不是 git 仓库,无法回退" };
    const record = readRecord(cwd, sid);
    if (!record || record.checkpoints.length === 0) {
        return { kind: "error", text: "本会话还没有检查点(每个回合开始前自动快照)" };
    }
    const turn = Number.isNaN(parsed) ? record.checkpoints[record.checkpoints.length - 1].turn : parsed;
    const entry = record.checkpoints.find((c) => c.turn === turn);
    if (!entry)
        return { kind: "error", text: `没有回合 ${turn} 的检查点(用 /checkpoints 查看可用回合)` };
    const head = await gitExec(gitBin, cwd, ["rev-parse", "--verify", "HEAD"]);
    if (!head.ok)
        return { kind: "error", text: "仓库还没有任何提交,无法回退" };
    // 1) 保存点:当前完整状态(含未跟踪)入 refs/dsh/saves/<sid>
    const idx = await gitExec(gitBin, cwd, ["write-tree"]);
    if (!idx.ok)
        return { kind: "error", text: `保存点失败:${idx.stderr || "write-tree failed"}` };
    let saveCommit;
    try {
        const add = await gitExec(gitBin, cwd, ["add", "-A"]);
        if (!add.ok)
            return { kind: "error", text: `保存点失败:${add.stderr || "add failed"}` };
        await gitExec(gitBin, cwd, ["reset", "--quiet", "--", ".dsh/rollback"]);
        const tree = await gitExec(gitBin, cwd, ["write-tree"]);
        if (!tree.ok)
            return { kind: "error", text: `保存点失败:${tree.stderr || "write-tree failed"}` };
        const commit = await gitExec(gitBin, cwd, [
            "-c", "commit.gpgsign=false", "commit-tree", tree.stdout, "-p", head.stdout,
            "-m", `${opts.commitPrefix}-save ${sid} before rollback to turn ${turn}`,
        ]);
        if (!commit.ok) {
            const retry = await gitExec(gitBin, cwd, [
                "-c", "user.name=dsh-checkpoint", "-c", "user.email=dsh-checkpoint@localhost",
                "-c", "commit.gpgsign=false", "commit-tree", tree.stdout, "-p", head.stdout,
                "-m", `${opts.commitPrefix}-save ${sid} before rollback to turn ${turn}`,
            ]);
            if (!retry.ok)
                return { kind: "error", text: `保存点失败:${retry.stderr || commit.stderr || "commit-tree failed"}` };
            saveCommit = retry.stdout;
        }
        else {
            saveCommit = commit.stdout;
        }
    }
    finally {
        await gitExec(gitBin, cwd, ["read-tree", idx.stdout]);
    }
    await gitExec(gitBin, cwd, ["update-ref", saveRef(opts.refPrefix, sid), saveCommit]);
    const currentUntracked = await untrackedList(gitBin, cwd);
    // 2) reset --hard 到目标检查点
    const reset = await gitExec(gitBin, cwd, ["reset", "--hard", entry.commit]);
    if (!reset.ok)
        return { kind: "error", text: `回退失败:${reset.stderr || "reset --hard failed"}` };
    // 3) 精确清理:删除回退前存在、但不在检查点清单里的未跟踪文件
    let removed = 0;
    if (!entry.truncated) {
        const manifest = new Set(entry.untracked ?? []);
        for (const f of currentUntracked.files) {
            if (manifest.has(f))
                continue;
            await rmPath(cwd, f);
            removed += 1;
        }
    }
    const roll = {
        turn,
        to: entry.commit,
        redo: saveCommit,
        removed,
        untracked: currentUntracked.files,
        truncated: currentUntracked.truncated,
        time: Date.now(),
    };
    record.rolls.push(roll);
    if (record.rolls.length > MAX_ROLLS)
        record.rolls = record.rolls.slice(-MAX_ROLLS);
    record.updatedAt = Date.now();
    writeRecord(cwd, sid, record);
    const truncNote = entry.truncated ? "\n(该检查点的未跟踪清单超限被截断,已跳过精确清理,请手动检查工作区)" : "";
    return {
        kind: "success",
        text: `已回退到回合 ${turn} 之前(检查点 ${shortHash(entry.commit)})。\n` +
            `删除回合后新建的未跟踪文件 ${removed} 个;你的既有提交与改动已存入保存点 ${shortHash(saveCommit)}。\n` +
            `/redo 可恢复;/checkpoints 查看全部检查点。${truncNote}`,
    };
}
export async function performRedo(gitBin, cwd, sid, opts) {
    const record = readRecord(cwd, sid);
    const roll = record && record.rolls.length > 0 ? record.rolls[record.rolls.length - 1] : undefined;
    if (!roll)
        return { kind: "error", text: "没有可重做的回退(先执行 /rollback)" };
    const verify = await gitExec(gitBin, cwd, ["rev-parse", "--verify", `${roll.redo}^{commit}`]);
    if (!verify.ok)
        return { kind: "error", text: "保存点已不可达(可能被 git gc),无法重做" };
    const currentUntracked = await untrackedList(gitBin, cwd);
    const reset = await gitExec(gitBin, cwd, ["reset", "--hard", roll.redo]);
    if (!reset.ok)
        return { kind: "error", text: `重做失败:${reset.stderr || "reset --hard failed"}` };
    const manifest = new Set(roll.untracked ?? []);
    let removed = 0;
    if (!roll.truncated) {
        for (const f of currentUntracked.files) {
            if (manifest.has(f))
                continue;
            await rmPath(cwd, f);
            removed += 1;
        }
    }
    roll.redoneAt = Date.now();
    record.updatedAt = Date.now();
    writeRecord(cwd, sid, record);
    return { kind: "success", text: `已恢复到回退前的状态(保存点 ${shortHash(roll.redo)}),删除回退后新建的未跟踪文件 ${removed} 个。` };
}
export async function listCheckpoints(gitBin, cwd, sid, opts) {
    const top = await gitExec(gitBin, cwd, ["rev-parse", "--show-toplevel"]);
    if (!top.ok || !top.stdout)
        return { kind: "error", text: "工作区不是 git 仓库" };
    const record = readRecord(cwd, sid);
    if (!record || record.checkpoints.length === 0) {
        return { kind: "success", text: "本会话暂无检查点。检查点会在每个回合开始前自动创建(turn/start 时快照工作区)。" };
    }
    const head = await gitExec(gitBin, cwd, ["rev-parse", "--short", "HEAD"]);
    const status = await gitExec(gitBin, cwd, ["status", "--porcelain"]);
    const dirty = status.ok && status.stdout ? status.stdout.split(/\r?\n/).length : 0;
    const lines = [];
    lines.push(`会话检查点(共 ${record.checkpoints.length} 个,工作区当前 HEAD ${head.stdout},未提交改动 ${dirty} 项):`);
    for (const c of record.checkpoints) {
        const when = new Date(c.time).toLocaleString();
        const unt = (c.untracked ?? []).length;
        lines.push(`  回合 ${c.turn} · ${shortHash(c.commit)} · ${when} · 未跟踪 ${unt}${c.truncated ? "(截断)" : ""}`);
    }
    const lastRoll = record.rolls[record.rolls.length - 1];
    if (lastRoll) {
        lines.push(`最近回退:回合 ${lastRoll.turn} → ${shortHash(lastRoll.to)};保存点 ${shortHash(lastRoll.redo)}(/redo 恢复)`);
    }
    lines.push(`用法:/rollback [N](默认最近一回合);/redo 恢复最近回退。`);
    lines.push(`清理:git update-ref -d ${opts.refPrefix}/checkpoints/${sid} 与 ${opts.refPrefix}/saves/${sid}(连同 .dsh/rollback 记录文件)`);
    return { kind: "success", text: lines.join("\n") };
}
