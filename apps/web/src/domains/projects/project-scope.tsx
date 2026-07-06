import { createContext, type ReactNode, use } from "react"

/**
 * Ambient "which project surface am I reading data for?" scope.
 *
 * Generalizes the original sandbox-only trace scope so the same reused read
 * collections (traces, sessions, tools, spans) serve Live, the Test-Mode
 * sandbox, and — once wired — the shared read-only Showcase. Each non-live
 * scope gets its own query-key namespace (so one scope's cache never bleeds
 * into another's) and, where the server needs it, its own server-fn payload
 * fragment. Components calling the collection hooks don't change; the scope is
 * read from context.
 *
 * `live` is the default and a strict no-op: an empty key prefix and an empty
 * payload fragment, so every query key and request under Live stays
 * BYTE-IDENTICAL to production before this scope existed. Only non-live kinds
 * add a namespace.
 *
 * Ownership: G3 owns this primitive. G4 consumes it (client scope stamp +
 * read-only write-gate) and S3 sets `showcase` from the reserved-slug loader.
 * `sandbox` is the only non-live kind wired today; `showcase` is declared here
 * for those tasks and is otherwise dormant.
 *
 * `sandbox` carries a client-provided org id (authorized server-side by the
 * sandbox middleware). `showcase` carries no org id — its org is resolved
 * server-side from the showcase pointer, never trusted from the client.
 *
 * @public Consumed by G4/S3; not imported elsewhere until then.
 */
export type ProjectScope =
  | { readonly kind: "live" }
  | { readonly kind: "sandbox"; readonly orgId: string }
  | { readonly kind: "showcase" }

/**
 * The default scope. A stable reference so Live consumers keep memo identity.
 * @public Consumed by G4/S3; not imported elsewhere until then.
 */
export const LIVE_SCOPE: ProjectScope = { kind: "live" }

/**
 * Read with {@link useProjectScope} (defaults to {@link LIVE_SCOPE}).
 * @public G4's client scope stamp reads the raw context; not imported elsewhere until then.
 */
export const ProjectScopeContext = createContext<ProjectScope>(LIVE_SCOPE)

export function ProjectScopeProvider({ scope, children }: { scope: ProjectScope; children: ReactNode }) {
  return <ProjectScopeContext.Provider value={scope}>{children}</ProjectScopeContext.Provider>
}

/** The current scope; `live` when no provider is mounted above. */
export function useProjectScope(): ProjectScope {
  return use(ProjectScopeContext)
}

/**
 * Query-key prefix for the scope. Live is **unmarked** (keys stay byte-identical
 * to production); non-live kinds namespace under their own segment. Spread it
 * ahead of the existing key: `[...projectScopeKey(scope), "traces", projectId, …]`.
 */
export function projectScopeKey(scope: ProjectScope): readonly unknown[] {
  switch (scope.kind) {
    case "live":
      return []
    case "sandbox":
      return ["sandbox", scope.orgId]
    case "showcase":
      return ["showcase"]
  }
}

/**
 * Server-fn `data` fragment carrying the scope (empty for Live). Only `sandbox`
 * sends an org id in the payload; the showcase org is resolved server-side, so
 * `showcase` adds nothing here. Spread into the payload:
 * `{ ...projectScopeData(scope), projectId, … }`.
 */
export function projectScopeData(scope: ProjectScope): { sandboxOrgId?: string } {
  return scope.kind === "sandbox" ? { sandboxOrgId: scope.orgId } : {}
}

/**
 * The sandbox org id for the scopes that fold it straight into an inline
 * query-key element or payload (the older spans / session-traces collections),
 * else `undefined`. Keeps those sites byte-identical to production; new
 * collections should use {@link projectScopeKey} + {@link projectScopeData}.
 */
export function sandboxOrgIdForScope(scope: ProjectScope): string | undefined {
  return scope.kind === "sandbox" ? scope.orgId : undefined
}
