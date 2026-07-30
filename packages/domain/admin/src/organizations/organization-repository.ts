import type { ApiKeyId, NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminOrganizationDetails } from "./organization-details.ts"
import type { AdminOrganizationUsageCursor } from "./organization-usage-summary.ts"

/**
 * Compact org summary keyed by id for the "organisations by usage" page.
 * Plan is the most recent active/trialing `subscriptions.plan` for the
 * org, or null when no such row exists.
 */
export interface AdminOrganizationSummary {
  readonly id: OrganizationId
  readonly name: string
  readonly slug: string
  readonly plan: string | null
  readonly memberCount: number
  readonly createdAt: Date
}

/** One org's current-period credit spend for the backoffice spend ranking. */
export interface AdminOrganizationCreditSpendRow {
  readonly organizationId: OrganizationId
  readonly consumedCredits: number
}

export interface ListOrganizationsByConsumedCreditsInput {
  /** Instant used to resolve "current" billing periods. */
  readonly now: Date
  /** Page size; the adapter probes `limit + 1` internally to set `hasMore`. */
  readonly limit: number
  /** Resume marker from a previous page; absent on the first page. */
  readonly cursor?: AdminOrganizationUsageCursor
}

export interface OrganizationsByConsumedCreditsPage {
  readonly rows: readonly AdminOrganizationCreditSpendRow[]
  readonly hasMore: boolean
}

/**
 * Cross-organization org-detail port for the backoffice.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB
 * connection — see `AdminOrganizationRepositoryLive` in
 * `@platform/db-postgres`. Only wired into handlers that have passed
 * `adminMiddleware` in `apps/web`.
 */
export class AdminOrganizationRepository extends Context.Service<
  AdminOrganizationRepository,
  {
    /**
     * Fetch an organisation, its members, and its (non-deleted)
     * projects in one call. Fails with `NotFoundError` when no org
     * exists.
     *
     * Members are returned with their per-org role AND their global
     * `users.role` (to surface platform-admins inside a tenant). Projects
     * exclude soft-deletes — same v1 policy as the project-detail page
     * and the search results.
     */
    findById(organizationId: OrganizationId): Effect.Effect<AdminOrganizationDetails, NotFoundError | RepositoryError>

    /**
     * Hydrate a batch of organisations by id with member count and current
     * plan. Result is keyed by organisation id; ids missing from the
     * underlying table simply don't appear in the returned map — callers
     * decide how to react (the usage page silently drops them).
     */
    findManySummariesByIds(
      ids: readonly OrganizationId[],
    ): Effect.Effect<ReadonlyMap<OrganizationId, AdminOrganizationSummary>, RepositoryError>

    /**
     * Rank non-sandbox organisations by current billing-period
     * `consumedCredits` desc (+ organisation id asc), returning up to
     * `limit` rows starting strictly after `cursor` when present. Orgs
     * with zero current-period spend are excluded.
     */
    listByConsumedCredits(
      input: ListOrganizationsByConsumedCreditsInput,
    ): Effect.Effect<OrganizationsByConsumedCreditsPage, RepositoryError>

    /**
     * Return the first non-deleted api-key id for the org, or `null` when
     * the org has none. Used by the "Create Demo Project" use-case to thread
     * the target org's existing default api key into the seed workflow so
     * ClickHouse spans reference a key that actually exists on the org —
     * not the canonical `SEED_API_KEY_ID` (which would only be valid on
     * the seed org). "First" is ordered by `createdAt asc` so the org's
     * default key (created at org-setup time via the `OrganizationCreated`
     * worker chain) wins; a nullable result lets the use-case fail loudly
     * for the degenerate "org with no api keys" case.
     */
    findFirstApiKeyId(organizationId: OrganizationId): Effect.Effect<ApiKeyId | null, RepositoryError>

    /**
     * Flip the org's `wantsShowcase` settings flag — the backoffice
     * counterpart to the user-facing "Remove demo" dismiss. Merges into the
     * existing `settings` JSON (never clobbering sibling keys) and bumps
     * `updated_at`. Fails `NotFoundError` when no org matches.
     */
    setWantsShowcase(
      organizationId: OrganizationId,
      enabled: boolean,
    ): Effect.Effect<void, NotFoundError | RepositoryError>
  }
>()("@domain/admin/AdminOrganizationRepository") {}
