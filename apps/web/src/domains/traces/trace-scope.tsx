import { createContext, type ReactNode } from "react"

/**
 * Ambient "which org am I reading traces for?" scope.
 *
 * `null` (the default) means Live — the session's active org, exactly as
 * production has always behaved. A non-null scope means a sandbox: the trace /
 * session / filter collections fold `sandboxOrgId` into their server-fn calls
 * (authorized by the sandbox middleware server-side) and into their query keys,
 * so a sandbox's cache never bleeds into Live's. Components calling the hooks
 * don't change — the scope is read from context.
 */
interface TraceScope {
  readonly sandboxOrgId: string
}

/** Read with `use(TraceScopeContext)` at the point of use (null ⇒ Live). */
export const TraceScopeContext = createContext<TraceScope | null>(null)

export function TraceScopeProvider({ scope, children }: { scope: TraceScope | null; children: ReactNode }) {
  return <TraceScopeContext.Provider value={scope}>{children}</TraceScopeContext.Provider>
}

/**
 * Query-key prefix for the current scope. Live is **unmarked** (keys stay
 * identical to today's production keys); a sandbox is namespaced under
 * `["sandbox", id]`. Spread it ahead of the existing key:
 * `[...traceScopeKey(scope), "traces", projectId, …]`.
 */
export function traceScopeKey(scope: TraceScope | null): readonly unknown[] {
  return scope ? ["sandbox", scope.sandboxOrgId] : []
}

/** Spread into a server-fn `data` payload to carry the scope (empty object for Live). */
export function traceScopeData(scope: TraceScope | null): { sandboxOrgId?: string } {
  return scope ? { sandboxOrgId: scope.sandboxOrgId } : {}
}
