interface SessionLike {
    id?: string;
    header?: {
        cwd?: string;
        delegationDepth?: number;
    };
}
/** 只读上下文能力:只为拿到可选服务,不声明 inject,老宿主上也安全。 */
interface ServiceHost {
    get?: (name: string) => unknown;
}
export interface ResolvedCwd {
    /** 生效目录(快照 / 回退的操作目录)。 */
    cwd?: string;
    /** 会话头目录(原始项目目录)。 */
    headerCwd?: string;
    /** 引用作用域;undefined 表示与会话头一致,沿用旧引用名。 */
    scope?: string;
}
export declare function resolveCwd(host: ServiceHost | undefined, session: SessionLike | undefined): ResolvedCwd;
export {};
