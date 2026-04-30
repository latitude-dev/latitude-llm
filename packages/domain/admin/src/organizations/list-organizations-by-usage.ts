import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"
import { AdminOrganizationUsageRepository } from "./organization-usage-repository.ts"
import type { AdminOrganizationUsageCursor, AdminOrganizationUsageSummary } from "./organization-usage-summary.ts"

/**
 * Rolling window for the usage ranking. 30d is short enough to track
 * "current" customers (a churned org drops out after a month) and long
 * enough to absorb weekend/holiday lulls without reshuffling the top
 * of the list.
 */
export const ORGANIZATION_USAGE_WINDOW_DAYS = 30
export const ORGANIZATION_USAGE_DEFAULT_LIMIT = 50
export const ORGANIZATION_USAGE_MAX_LIMIT = 100

export interface ListOrganizationsByUsageInput {
  readonly cursor?: AdminOrganizationUsageCursor
  readonly limit?: number
  /**
   * Anchor for the rolling window — defaults to "now". Tests pin this for
   * determinism; production callers should leave it unset.
   */
  readonly now?: Date
}

export interface ListOrganizationsByUsageOutput {
  readonly items: readonly AdminOrganizationUsageSummary[]
  readonly nextCursor: AdminOrganizationUsageCursor | null
}

const clampLimit = (limit: number | undefined): number => {
  const requested = limit ?? ORGANIZATION_USAGE_DEFAULT_LIMIT
  if (requested < 1) return 1
  if (requested > ORGANIZATION_USAGE_MAX_LIMIT) return ORGANIZATION_USAGE_MAX_LIMIT
  return requested
}

export const listOrganizationsByUsageUseCase = (
  input: ListOrganizationsByUsageInput,
): Effect.Effect<
  ListOrganizationsByUsageOutput,
  RepositoryError,
  AdminOrganizationRepository | AdminOrganizationUsageRepository
> =>
  Effect.gen(function* () {
    const limit = clampLimit(input.limit)
    const now = input.now ?? new Date()
    const since = new Date(now.getTime() - ORGANIZATION_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    yield* Effect.annotateCurrentSpan("admin.usage.windowDays", ORGANIZATION_USAGE_WINDOW_DAYS)
    yield* Effect.annotateCurrentSpan("admin.usage.limit", limit)

    const usageRepo = yield* AdminOrganizationUsageRepository
    const orgRepo = yield* AdminOrganizationRepository

    const page = yield* usageRepo.listByTraceCount({
      since,
      limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    })

    if (page.rows.length === 0) {
      return { items: [], nextCursor: null }
    }

    const summaries = yield* orgRepo.findManySummariesByIds(page.rows.map((r) => r.organizationId))

    const items: AdminOrganizationUsageSummary[] = []
    for (const row of page.rows) {
      // CH knows the org id; PG is authoritative for the rest. If a row
      // appears in CH but is missing from PG (hard-deleted org with
      // residual traces) we drop it silently — surfacing "(unknown)"
      // would be confusing in a customer-ranking page.
      const summary = summaries.get(row.organizationId)
      if (!summary) continue
      items.push({
        id: summary.id,
        name: summary.name,
        slug: summary.slug,
        plan: summary.plan,
        memberCount: summary.memberCount,
        traceCount: row.traceCount,
        lastTraceAt: row.lastTraceAt,
        createdAt: summary.createdAt,
      })
    }

    // Cursor anchors on the last CH row (not the last *kept* item) so
    // the next page query strictly skips past dropped/missing orgs and
    // never re-fetches them.
    const lastRow = page.hasMore ? page.rows[page.rows.length - 1] : undefined
    const nextCursor = lastRow
      ? { traceCount: lastRow.traceCount, organizationId: lastRow.organizationId as string }
      : null

    return { items, nextCursor }
  }).pipe(Effect.withSpan("admin.listOrganizationsByUsage"))
