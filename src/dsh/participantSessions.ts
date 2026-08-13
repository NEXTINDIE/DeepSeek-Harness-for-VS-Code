import * as vscode from "vscode";

/**
 * 参与者会话与工作区项目的映射。
 *
 * - participantSessionMode = "global":所有项目共用一个会话。
 * - participantSessionMode = "per-workspace"(默认):每个项目(工作区文件夹)各自独立的会话;
 *   多根工作区中按"当前活动编辑器所在文件夹"解析,跨项目切换编辑器即切换会话上下文,
 *   会话本身全部保存在 DSH 服务器上,随时可用 /session 命令显式切换。
 */

export function activeFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return undefined;
  if (folders.length === 1) return folders[0];
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) return folder;
  }
  return folders[0];
}

/** 当前项目的工作目录(多根工作区 = 活动编辑器所在文件夹,否则第一个文件夹)。 */
export function folderCwd(): string | undefined {
  return activeFolder()?.uri.fsPath;
}

/** 当前项目的会话映射键。 */
export function participantKey(): string {
  const mode = vscode.workspace.getConfiguration("dsh").get<string>("participantSessionMode", "per-workspace");
  if (mode === "global") return "dsh.participant.session.global";
  const folder = activeFolder();
  return `dsh.participant.session.folder:${folder?.uri.toString() ?? "none"}`;
}

export async function getParticipantSession(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return ctx.workspaceState.get<string>(participantKey());
}

export async function setParticipantSession(ctx: vscode.ExtensionContext, sessionId: string): Promise<void> {
  await ctx.workspaceState.update(participantKey(), sessionId);
}
