/**
 * 检查点机制:回合开始前的全量 git 快照,写入隐藏 ref + 记录文件。
 *
 * - 快照序列(add -A 收录未跟踪文件,不污染用户暂存区):
 *   write-tree(保存用户索引)→ add -A → write-tree(全量树)→ commit-tree → read-tree(精确还原索引)
 * - 检查点链:新检查点的父 = 现有 tip(refs/dsh/checkpoints/<sid>),首检查点父 = 当时 HEAD
 *   (unborn 分支为根提交);链保证所有检查点从一个 ref 可达,git gc 不回收。
 * - 记录文件是回合号等元数据的权威来源;提交信息也嵌入回合号,
 *   记录丢失时可从链上提交信息重建(foldCheckpoints)。
 */
import { commitTree, checkpointRef, gitExec, readRecord, untrackedList, writeRecord } from "./git.js";
import { MAX_CHECKPOINTS, } from "./types.js";
/** git 的空树对象(空索引的等价物)。 */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** 全量快照提交:返回新提交;无改动(树与父一致)时返回 {ok, unchanged}。 */
export async function snapshotCommit(gitBin, cwd, parent, message) {
    const idx = await gitExec(gitBin, cwd, ["write-tree"]);
    let indexTree = EMPTY_TREE;
    if (idx.ok) {
        indexTree = idx.stdout;
    }
    else {
        // write-tree 失败:区分「索引为空(unborn 仓库,尚无 add)」与「存在未合并冲突」
        const unmerged = await gitExec(gitBin, cwd, ["ls-files", "-u"]);
        if (unmerged.ok && unmerged.stdout)
            return { ok: false, reason: "index has unmerged entries; skipping snapshot" };
        // 空索引:以空树还原
    }
    try {
        // 全量入暂存(无 pathspec:ignored 文件静默跳过、退出码恒为 0);
        // 带 pathspec 的写法会在工作区 .gitignore 忽略某些目录时以非零退出。
        const add = await gitExec(gitBin, cwd, ["add", "-A"]);
        if (!add.ok)
            return { ok: false, reason: `add: ${add.stderr || "failed"}` };
        // 插件自己的记录目录(.dsh/rollback)不进快照:从索引撤出;目录尚不存在时忽略失败
        await gitExec(gitBin, cwd, ["reset", "--quiet", "--", ".dsh/rollback"]);
        const tree = await gitExec(gitBin, cwd, ["write-tree"]);
        if (!tree.ok)
            return { ok: false, reason: `write-tree: ${tree.stderr || "failed"}` };
        let parentTree;
        if (parent) {
            const pt = await gitExec(gitBin, cwd, ["rev-parse", `${parent}^{tree}`]);
            if (pt.ok)
                parentTree = pt.stdout;
        }
        if (parentTree !== undefined && tree.stdout === parentTree)
            return { ok: true, unchanged: true, tree: tree.stdout };
        const commit = await commitTree(gitBin, cwd, tree.stdout, parent, message);
        if (!commit.ok)
            return { ok: false, reason: `commit-tree: ${commit.stderr || "failed"}` };
        return { ok: true, commit: commit.stdout, tree: tree.stdout };
    }
    finally {
        await gitExec(gitBin, cwd, ["read-tree", indexTree]);
    }
}
/** 当前检查点 tip(链头);返回是否来自 ref(决定 update-ref 的 old 值)。 */
async function currentTip(gitBin, cwd, sid, refPrefix, record) {
    const tip = await gitExec(gitBin, cwd, ["rev-parse", "--verify", checkpointRef(refPrefix, sid)]);
    if (tip.ok && /^[0-9a-f]{40}$/.test(tip.stdout))
        return { commit: tip.stdout, fromRef: true };
    const last = record?.checkpoints[record.checkpoints.length - 1];
    if (last && /^[0-9a-f]{40}$/.test(last.commit))
        return { commit: last.commit, fromRef: false };
    return { fromRef: false };
}
/** 回合开始时的检查点(每仓库串行化由调用方保证)。 */
export async function checkpointTurn(gitBin, cwd, sid, turn, time, opts) {
    const top = await gitExec(gitBin, cwd, ["rev-parse", "--show-toplevel"]);
    if (!top.ok || !top.stdout)
        return; // 非 git 仓库:不检查点
    const record = readRecord(cwd, sid) ?? { version: 2, sessionId: sid, cwd, checkpoints: [], rolls: [] };
    if (record.checkpoints.some((c) => c.turn === turn))
        return; // 幂等
    const tipInfo = await currentTip(gitBin, cwd, sid, opts.refPrefix, record);
    let parent = tipInfo.commit;
    if (!parent) {
        const head = await gitExec(gitBin, cwd, ["rev-parse", "--verify", "HEAD"]);
        if (head.ok)
            parent = head.stdout; // 首检查点父 = 当时 HEAD;unborn 时保持 undefined(根提交)
    }
    const untrackedBefore = await untrackedList(gitBin, cwd);
    const snap = await snapshotCommit(gitBin, cwd, parent, `${opts.commitPrefix} ${sid} turn ${turn}`);
    if (!snap.ok) {
        console.error("[dsh-git-rollback] checkpoint failed:", snap.reason);
        return;
    }
    // 无改动回合(树与父一致)也记录检查点条目:复用父提交,不创建新提交。
    // 这样回合结束快照(after)仍能归属该回合——回合内新建/修改的文件不会
    // "落进"下一个回合的开始检查点,点击该回合的「还原检查点」才能撤销它们。
    const commit = snap.unchanged ? parent : snap.commit;
    if (!commit)
        return; // 无父且无新提交(理论上不发生)
    if (!snap.unchanged) {
        // ref 已存在 → old = 当前值(CAS);首创建 → old = 全零(必须不存在)
        const oldValue = tipInfo.fromRef && tipInfo.commit ? tipInfo.commit : "";
        const refResult = await gitExec(gitBin, cwd, ["update-ref", checkpointRef(opts.refPrefix, sid), snap.commit, oldValue]);
        if (!refResult.ok) {
            console.error("[dsh-git-rollback] checkpoint ref update failed:", refResult.stderr);
        }
    }
    const entry = {
        turn,
        commit,
        parent: parent ?? undefined,
        time,
        untracked: untrackedBefore.files,
        truncated: untrackedBefore.truncated,
    };
    record.checkpoints.push(entry);
    if (record.checkpoints.length > MAX_CHECKPOINTS)
        record.checkpoints = record.checkpoints.slice(-MAX_CHECKPOINTS);
    record.updatedAt = Date.now();
    writeRecord(cwd, sid, record);
}
/**
 * 回合结束快照:记录该回合自身产生的改动(after)。
 * 该回合的改动 = diff(回合开始检查点 → after),供 /undo 精确撤销——只撤销会话自己的改动,
 * 用户回合之后自行提交的内容不受影响。无改动回合不记录 after(撤销时视为无可撤销)。
 */
export async function checkpointTurnEnd(gitBin, cwd, sid, turn, time, opts) {
    const top = await gitExec(gitBin, cwd, ["rev-parse", "--show-toplevel"]);
    if (!top.ok || !top.stdout)
        return; // 非 git 仓库:不检查点
    const record = readRecord(cwd, sid) ?? { version: 2, sessionId: sid, cwd, checkpoints: [], rolls: [] };
    const entry = record.checkpoints.find((c) => c.turn === turn);
    if (!entry || entry.after)
        return; // 无开始检查点或已记录
    const snap = await snapshotCommit(gitBin, cwd, entry.commit, `${opts.commitPrefix}-end ${sid} turn ${turn}`);
    if (!snap.ok || snap.unchanged) {
        if (!snap.ok)
            console.error("[dsh-git-rollback] turn-end checkpoint failed:", snap.reason);
        return; // 无改动:不记录 after
    }
    const tip = await gitExec(gitBin, cwd, ["rev-parse", "--verify", checkpointRef(opts.refPrefix, sid)]);
    const refResult = await gitExec(gitBin, cwd, ["update-ref", checkpointRef(opts.refPrefix, sid), snap.commit, tip.ok ? tip.stdout : ""]);
    if (!refResult.ok) {
        console.error("[dsh-git-rollback] turn-end ref update failed:", refResult.stderr);
        return;
    }
    entry.after = { commit: snap.commit, time };
    record.updatedAt = Date.now();
    writeRecord(cwd, sid, record);
}
/**
 * 从链重建检查点清单(记录文件丢失时的兜底):沿提交父链走,
 * 解析提交信息里的 `turn <N>`,越新越靠后。
 */
export async function foldCheckpoints(gitBin, cwd, sid, opts) {
    const tip = await gitExec(gitBin, cwd, ["rev-parse", "--verify", checkpointRef(opts.refPrefix, sid)]);
    if (!tip.ok)
        return [];
    const out = [];
    const seen = new Set();
    let cursor = tip.stdout;
    while (cursor && /^[0-9a-f]{40}$/.test(cursor) && !seen.has(cursor)) {
        seen.add(cursor);
        const [meta, parentRes] = await Promise.all([
            gitExec(gitBin, cwd, ["show", "-s", "--format=%ct %s", cursor]),
            gitExec(gitBin, cwd, ["rev-parse", `${cursor}^`]),
        ]);
        const match = /^(\d+)\s+(.+)\s+turn\s+(\d+)\s*$/.exec(meta.stdout);
        if (!match)
            break; // 走到用户提交(首检查点的父)即停
        out.push({
            turn: Number.parseInt(match[3], 10),
            commit: cursor,
            parent: parentRes.ok ? parentRes.stdout : undefined,
            time: Number.parseInt(match[1], 10) * 1000,
            untracked: [],
            truncated: true,
        });
        cursor = parentRes.ok ? parentRes.stdout : undefined;
    }
    return out.reverse();
}
