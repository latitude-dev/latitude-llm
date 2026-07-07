import type { OrganizationId } from "@domain/shared"
import type { ProjectScope } from "../domains/projects/project-scope.tsx"
import { requireSession } from "./auth.ts"
import { resolveShowcaseAccess } from "./resolve-showcase-access.ts"
import { resolveSandboxAccess } from "./sandbox-access.ts"

declare const scopedOrgIdBrand: unique symbol

/**
 * An organization id that has been resolved *and authorized* for the current
 * request scope by {@link resolveOrgScope} — the only place allowed to mint one.
 * `withScopedClickHouse` requires this brand, so a ClickHouse read (which has no
 * RLS backstop) cannot run against a raw session/user-supplied org: it must come
 * from the resolver. Structurally makes "forgot to scope this read" a compile
 * error, not a silently-wrong query.
 */
export type ScopedOrgId = OrganizationId & { readonly [scopedOrgIdBrand]: true }

/**
 * The single chokepoint that resolves which organization a scoped read must run
 * against, from the request's {@link ProjectScope} (stamped onto every server-fn
 * request by the write-gate client middleware, so it arrives in `context` here —
 * per-request, never a shared singleton on the server).
 *
 * - `live` (default) → the session's active org, as always.
 * - `sandbox` → the sandbox org, but only after `resolveSandboxAccess` confirms
 *   the caller is a member of its parent org (same gate as `sandboxMiddleware`).
 * - `showcase` → the pinned showcase org, but only after `resolveShowcaseAccess`
 *   authorizes the requesting org's `wantsShowcase` (else 404).
 *
 * Every scope authorizes server-side and returns exactly one org id — the *only*
 * value a caller hands to both the data layer (`withPostgres`/`withClickHouse`)
 * and the repo/query arg. New scoped reads call this and nothing else, so a new
 * scope kind is wired here once, never fanned out across read endpoints. The
 * scope kind is client-supplied but every non-live branch re-authorizes, so it
 * can only ever resolve an org the caller is already entitled to.
 */
export async function resolveOrgScope(context: {
  readonly projectScope?: ProjectScope | undefined
}): Promise<ScopedOrgId> {
  const scope: ProjectScope = context.projectScope ?? { kind: "live" }

  // The `as ScopedOrgId` casts below are the *only* sanctioned mint points: each
  // sits on the far side of an authorization (session / sandbox membership /
  // wantsShowcase), so the brand certifies "authorized for this request scope".
  switch (scope.kind) {
    case "live": {
      const { organizationId } = await requireSession()
      return organizationId as ScopedOrgId
    }
    case "sandbox": {
      const { userId } = await requireSession()
      const sandbox = await resolveSandboxAccess({ sandboxOrgId: scope.orgId, userId })
      return sandbox.organizationId as ScopedOrgId
    }
    case "showcase": {
      const { organizationId } = await resolveShowcaseAccess()
      return organizationId as ScopedOrgId
    }
  }
}
