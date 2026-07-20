import type { OrganizationId, UserId } from "@domain/shared"
import type { ProjectScope } from "../domains/projects/project-scope.tsx"
import { requireSession } from "./auth.ts"
import { resolveShowcaseAccess } from "./resolve-showcase-access.ts"
import { resolveSandboxAccess } from "./sandbox-access.ts"

declare const scopedOrgIdBrand: unique symbol

/**
 * An organization id that has been resolved *and authorized* for the current
 * request scope by {@link requireScopedSession} (which {@link resolveOrgScope}
 * funnels through) — the only place allowed to mint one. `withScopedClickHouse`
 * requires this brand, so a ClickHouse read (which has no RLS backstop) cannot
 * run against a raw session/user-supplied org: it must come from the resolver.
 * Structurally makes "forgot to scope this read" a compile error, not a
 * silently-wrong query.
 */
export type ScopedOrgId = OrganizationId & { readonly [scopedOrgIdBrand]: true }

/**
 * The single chokepoint that resolves and authorizes the organization a scoped
 * request must run against, from the request's {@link ProjectScope} (stamped
 * onto every server-fn request by the write-gate client middleware, so it
 * arrives in `context` here — per-request, never a shared singleton on the
 * server). Also hands back the session `userId` on the branches that already
 * read it, so {@link requireScopedSession} needn't read the session twice.
 * Callers use the public {@link resolveOrgScope} / {@link requireScopedSession}
 * wrappers, never this directly.
 *
 * - `live` (default) → the session's active org, as always.
 * - `sandbox` → the sandbox org, but only after `resolveSandboxAccess` confirms
 *   the caller is a member of its parent org (same gate as `sandboxMiddleware`).
 * - `showcase` → the pinned showcase org, but only after `resolveShowcaseAccess`
 *   authorizes the requesting org's `wantsShowcase` (else 404).
 *
 * Every scope authorizes server-side and returns exactly one org id — the *only*
 * value a caller hands to both the data layer (`withPostgres`/`withClickHouse`)
 * and the repo/query arg. New scoped requests call this (or {@link
 * resolveOrgScope} when they don't need the `userId`) and nothing else, so a new
 * scope kind is wired here once, never fanned out across endpoints. The scope
 * kind is client-supplied but every non-live branch re-authorizes, so it can
 * only ever resolve an org the caller is already entitled to.
 *
 * The `as ScopedOrgId` casts below are the *only* sanctioned mint points: each
 * sits on the far side of an authorization (session / sandbox membership /
 * wantsShowcase), so the brand certifies "authorized for this request scope".
 */
async function resolveScope(context: {
  readonly projectScope?: ProjectScope | undefined
}): Promise<{ organizationId: ScopedOrgId; sessionUserId: UserId | null }> {
  const scope: ProjectScope = context.projectScope ?? { kind: "live" }

  switch (scope.kind) {
    case "live": {
      const { userId, organizationId } = await requireSession()
      return { organizationId: organizationId as ScopedOrgId, sessionUserId: userId }
    }
    case "sandbox": {
      const { userId } = await requireSession()
      const sandbox = await resolveSandboxAccess({ sandboxOrgId: scope.orgId, userId })
      return { organizationId: sandbox.organizationId as ScopedOrgId, sessionUserId: userId }
    }
    case "showcase": {
      // `resolveShowcaseAccess` authorizes against the session internally but
      // returns only the org — the `userId` isn't a free byproduct here, so
      // leave it to `requireScopedSession` to fetch iff a caller needs it.
      const { organizationId } = await resolveShowcaseAccess()
      return { organizationId: organizationId as ScopedOrgId, sessionUserId: null }
    }
  }
}

/**
 * The scoped org alone, for the many reads that don't need the caller's
 * `userId`. See {@link requireScopedSession} for how each scope authorizes and
 * mints the {@link ScopedOrgId}.
 */
export async function resolveOrgScope(context: {
  readonly projectScope?: ProjectScope | undefined
}): Promise<ScopedOrgId> {
  const { organizationId } = await resolveScope(context)
  return organizationId
}

/**
 * The scoped org *and* the caller's `userId`, for handlers that need both — the
 * common shape for scoped mutations (e.g. "delete X, authored by me, in this
 * project's org"). Live/sandbox get the `userId` for free from the session the
 * scope resolution already read; showcase fetches it separately (its writes are
 * blocked upstream by the write-gate, so that extra read is off the hot path).
 */
export async function requireScopedSession(context: {
  readonly projectScope?: ProjectScope | undefined
}): Promise<{ userId: UserId; organizationId: ScopedOrgId }> {
  const { organizationId, sessionUserId } = await resolveScope(context)
  const userId = sessionUserId ?? (await requireSession()).userId
  return { userId, organizationId }
}
