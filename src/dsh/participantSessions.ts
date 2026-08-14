import * as vscode from "vscode";
import * as os from "node:os";
import { dirname } from "node:path";

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

/**
 * 当前项目的工作目录,按优先级回退:
 * 1. VS Code 工作区文件夹(多根 = 活动编辑器所在文件夹);
 * 2. 打开的文件的所在目录(未打开文件夹时);
 * 3. 用户主目录(什么都没打开时,避免服务器回退到"上次会话目录")。
 */
export function folderCwd(): string | undefined {
  const folder = activeFolder();
  if (folder) return folder.uri.fsPath;
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.scheme === "file") {
    return dirname(editor.document.uri.fsPath);
  }
  return os.homedir();
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
