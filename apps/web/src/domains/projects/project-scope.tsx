import { isShowcaseProjectSlug } from "@domain/shared"
import { createContext, type ReactNode, use } from "react"

/**
 * Ambient "which project surface am I reading data for?" scope.
 *
 * Generalizes the sandbox-only trace scope so the same reused read collections
 * (traces, sessions, tools, spans) serve Live, the Test-Mode sandbox, and the
 * shared read-only Showcase. Each non-live scope gets its own query-key
 * namespace (so one scope's cache never bleeds into another's) and, where the
 * server needs it, its own server-fn payload fragment. Components calling the
 * collection hooks don't change; the scope is read from context.
 *
 * `live` is the default and a strict no-op: an empty key prefix and an empty
 * payload fragment, so every query key and request under Live stays
 * byte-identical to an unscoped read. Only non-live kinds add a namespace.
 *
 * `sandbox` carries a client-provided org id (authorized server-side by the
 * sandbox middleware). `showcase` carries no org id — its org is resolved
 * server-side from the showcase pointer, never trusted from the client.
 */
export type ProjectScope =
  | { readonly kind: "live" }
  | { readonly kind: "sandbox"; readonly orgId: string }
  | { readonly kind: "showcase" }

/** The default scope. A stable reference so Live consumers keep memo identity. */
export const LIVE_SCOPE: ProjectScope = { kind: "live" }

/** The shared read-only Showcase scope. A stable reference (its org is resolved server-side). */
export const SHOWCASE_SCOPE: ProjectScope = { kind: "showcase" }

/** The scope context. Read it with {@link useProjectScope} (defaults to {@link LIVE_SCOPE}). */
const ProjectScopeContext = createContext<ProjectScope>(LIVE_SCOPE)

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
export function projectScopeData(scope: ProjectScope): {
  sandboxOrgId?: string
} {
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

/**
 * Whether the scope forbids writes. Only `showcase` (the shared read-only demo)
 * is read-only; `sandbox` stays writable.
 */
export function isReadOnlyScope(scope: ProjectScope): boolean {
  return scope.kind === "showcase"
}

const SANDBOX_PATH = /^\/sandbox\/([^/]+)(?:\/|$)/
const PROJECT_PATH = /^\/projects\/([^/]+)(?:\/|$)/

/**
 * The current scope for consumers that run outside React and so cannot read it
 * via {@link useProjectScope} — notably the client-side write-gate middleware,
 * which stamps the scope onto outgoing server-fn requests.
 *
 * Derived from the URL (the same source of truth the `$projectSlug` loader uses:
 * the reserved showcase slug), so it's stateless and always current at request
 * time — no mounted-provider mirror to keep in sync. **Client-only**: it reads
 * `window.location`, and the server never calls this — it reads the per-request
 * `context.projectScope` the write-gate stamps. Defaults to {@link LIVE_SCOPE}.
 */
export function getCurrentProjectScope(): ProjectScope {
  if (typeof window === "undefined") return LIVE_SCOPE
  const path = window.location.pathname
  const sandbox = SANDBOX_PATH.exec(path)
  if (sandbox) return { kind: "sandbox", orgId: decodeURIComponent(sandbox[1]) }
  const project = PROJECT_PATH.exec(path)
  if (project && isShowcaseProjectSlug(decodeURIComponent(project[1]))) return SHOWCASE_SCOPE
  return LIVE_SCOPE
}
