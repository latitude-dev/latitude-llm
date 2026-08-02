import type { OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Unpriced usage for one provider/model pair inside one project — the grain ClickHouse groups at.
 * The use-case rolls these up to the pair level, since a pair is what a fix acts on.
 */
export interface AdminUnpricedSpanSlice {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly provider: string
  readonly model: string
  readonly spans: number
  readonly tokens: number
  readonly firstSeenAt: Date
  readonly lastOccurrenceAt: Date
}

export interface ListUnpricedSpanSlicesInput {
  /** Inclusive lower bound on span start time. */
  readonly since: Date
}

/**
 * Cross-organisation unpriced-usage port for the backoffice.
 *
 * WARNING: cross-tenant by design — the query scans `spans` over every organisation in the
 * cluster. Only ever wire it into handlers that have already passed `adminMiddleware`. The adapter
 * ships in `@platform/db-clickhouse` as `AdminUnpricedSpanRepositoryLive`.
 */
export class AdminUnpricedSpanRepository extends Context.Service<
  AdminUnpricedSpanRepository,
  {
    /**
     * Every `cost_source = 'unpriced'` slice at or after `since`, on billable operations only.
     *
     * Deliberately reads the stored label rather than re-deriving zero-cost usage: rows written
     * before the `cost_source` cutover read back blank, and a blank zero cannot say whether it was
     * unpriced or genuinely free. Including them would import guesses.
     */
    listUnpricedSlices(
      input: ListUnpricedSpanSlicesInput,
    ): Effect.Effect<readonly AdminUnpricedSpanSlice[], RepositoryError>
  }
>()("@domain/admin/AdminUnpricedSpanRepository") {}
