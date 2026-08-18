// Cordis 动态插件远程契约类型(与网页端 dynamicCordisRunner 一致)。
// 端点:POST /api/dynamicCordisRunner/<method>,载荷 {args:{...}}。

export interface CordisPackageInfo {
  packageId: string;
  name: string;
  purpose: string;
  hasHostHalf: boolean;
  hasClientHalf: boolean;
}

export type CordisRunStatus =
  | "rejected"
  | "awaiting-approval"
  | "running"
  | "cancelled"
  | "starting-host"
  | "client-pending"
  | "waiting"
  | "failed"
  | "stopped";

export interface CordisHalfState {
  status: "running" | "waiting" | "failed" | "stopped" | "absent" | "pending";
  waitingFor: string[];
  error?: string;
}

export interface CordisRunError {
  phase: "approval" | "host-load" | "host-apply" | "client-load" | "client-apply" | "client-render";
  message: string;
  stack?: string;
  pluginId: string;
  packageId: string;
  pluginRunId: string;
}

export interface CordisRunAttempt {
  pluginRunId: string;
  packageId: string;
  mode: "run" | "update";
  status: CordisRunStatus;
  approvalRequestId?: string;
  requiresApproval?: boolean;
  host: CordisHalfState;
  client: CordisHalfState;
  error?: CordisRunError;
}

export interface CordisPluginRow {
  pluginId: string;
  agentId: string;
  packages: CordisPackageInfo[];
  currentPackageId?: string;
  nextPackageId?: string;
  activeRun?: { pluginRunId: string; packageId: string };
  latestRun?: CordisRunAttempt;
}

/** cordis/request-run 帧载荷(审批请求)。 */
export interface CordisRequestRun {
  requestId: string;
  agentId: string;
  pluginId: string;
  packageId: string;
  mode: "run" | "update";
  name: string;
  purpose: string;
  requiresApproval: boolean;
}

/** cordis/request-run-resolved 帧载荷。 */
export interface CordisRequestRunResolved {
  requestId: string;
  outcome: "approved" | "rejected" | "failed" | "completed" | "cancelled";
}

/** cordis/dynamic-package 帧载荷。 */
export interface CordisDynamicPackage {
  pluginId: string;
  packageId: string;
}

/** cordis/dynamic-retract 帧载荷(停止 / 移除)。 */
export interface CordisDynamicRetract {
  pluginId: string;
  packageId: string;
  pluginRunId: string;
}

/** runHostHalf 响应。 */
export type CordisRunHostHalfResult =
  | {
      ok: true;
      status: "awaiting-approval" | "starting" | "running" | "client-pending";
      pluginId: string;
      packageId: string;
      pluginRunId: string;
      mode: "run" | "update";
      waitingFor: string[];
      startedHere?: boolean;
      currentPackageId?: string;
      nextPackageId?: string;
    }
  | { ok: false; message: string; stack?: string };

/** 审批/直接运行的客户端侧结算结果。 */
export interface CordisRunResolution {
  ok: boolean;
  reason?: string;
  pluginRunId?: string;
  waitingFor?: string[];
  startedHere?: boolean;
  message?: string;
  stack?: string;
}

export type CordisStopResult = { ok: true } | { ok: false; reason: "plugin-missing" | "not-running"; message: string };

export type CordisUndefineResult = { ok: true } | { ok: false; reason: string; message: string };
