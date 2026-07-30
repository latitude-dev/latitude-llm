import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"
import { AdminOrganizationUsageRepository } from "./organization-usage-repository.ts"
import type { AdminOrganizationUsageCursor, AdminOrganizationUsageSummary } from "./organization-usage-summary.ts"

/**
 * Rolling window for the traces column. Credit spend uses each org's
 * current billing period instead. 30d is short enough to track "current"
 * customers (a churned org drops out after a month) and long enough to
 * absorb weekend/holiday lulls without reshuffling the activity signal.
 */
export const ORGANIZATION_USAGE_WINDOW_DAYS = 30
export const ORGANIZATION_USAGE_DEFAULT_LIMIT = 50
export const ORGANIZATION_USAGE_MAX_LIMIT = 100

export interface ListOrganizationsByUsageInput {
  readonly cursor?: AdminOrganizationUsageCursor
  readonly limit?: number
  /**
   * Anchor for "now" (current billing period + rolling traces window).
   * Tests pin this for determinism; production callers should leave it unset.
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
    // Prefer cursor asOf so later pages keep the first page's ranking instant across period boundaries.
    const now = input.cursor?.asOf ?? input.now ?? new Date()
    const since = new Date(now.getTime() - ORGANIZATION_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    yield* Effect.annotateCurrentSpan("admin.usage.windowDays", ORGANIZATION_USAGE_WINDOW_DAYS)
    yield* Effect.annotateCurrentSpan("admin.usage.limit", limit)

    const orgRepo = yield* AdminOrganizationRepository
    const usageRepo = yield* AdminOrganizationUsageRepository

    const page = yield* orgRepo.listByConsumedCredits({
      now,
      limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    })

    if (page.rows.length === 0) {
      return { items: [], nextCursor: null }
    }

    const organizationIds = page.rows.map((r) => r.organizationId)
    const [summaries, usageByOrg] = yield* Effect.all([
      orgRepo.findManySummariesByIds(organizationIds),
      usageRepo.findManyByOrganizationIds({ organizationIds, since }),
    ])

    const items: AdminOrganizationUsageSummary[] = []
    for (const row of page.rows) {
      // Ranking knows the org id; summaries are authoritative for the rest.
      // If a row appears in billing but is missing from the summary map
      // (hard-deleted org, or sandbox filtered out) we drop it silently —
      // the cursor still anchors on the ranking row so pagination skips it.
      const summary = summaries.get(row.organizationId)
      if (!summary) continue
      const usage = usageByOrg.get(row.organizationId)
      items.push({
        id: summary.id,
        name: summary.name,
        slug: summary.slug,
        plan: summary.plan,
        memberCount: summary.memberCount,
        consumedCredits: row.consumedCredits,
        traceCount: usage?.traceCount ?? 0,
        lastTraceAt: usage?.lastTraceAt ?? null,
        createdAt: summary.createdAt,
      })
    }

    const lastRow = page.hasMore ? page.rows[page.rows.length - 1] : undefined
    const nextCursor = lastRow
      ? {
          consumedCredits: lastRow.consumedCredits,
          organizationId: lastRow.organizationId as string,
          asOf: now,
        }
      : null

    return { items, nextCursor }
  }).pipe(Effect.withSpan("admin.listOrganizationsByUsage"))
