import type { OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AdminOrganizationUsageCursor } from "./organization-usage-summary.ts"

/** Per-organisation slice of trace activity inside the rolling usage window. */
export interface AdminOrganizationUsageRow {
  readonly organizationId: OrganizationId
  readonly traceCount: number
  readonly lastTraceAt: Date | null
}

export interface ListOrganizationsByTraceCountInput {
  /** Inclusive lower bound on trace start time. */
  readonly since: Date
  /** Page size; the adapter probes `limit + 1` internally to set `hasMore`. */
  readonly limit: number
  /** Resume marker from a previous page; absent on the first page. */
  readonly cursor?: AdminOrganizationUsageCursor
}

export interface OrganizationsByTraceCountPage {
  readonly rows: readonly AdminOrganizationUsageRow[]
  readonly hasMore: boolean
}

/**
 * Cross-organisation trace-aggregation port for the backoffice
 * "organisations by usage" page.
 *
 * WARNING: this port is cross-tenant by design — adapters aggregate
 * `traces` over every organisation in the cluster. Only ever wire it
 * into handlers that have already passed `adminMiddleware`. The
 * adapter ships in `@platform/db-clickhouse` as
 * `AdminOrganizationUsageRepositoryLive`.
 */
export class AdminOrganizationUsageRepository extends ServiceMap.Service<
  AdminOrganizationUsageRepository,
  {
    /**
     * Aggregate traces ingested at or after `since` by organisation, sort
     * by trace count desc + organisation id asc, and return up to `limit`
     * rows starting strictly after `cursor` when present. Excludes orgs
     * with zero traces in the window — the table is a usage ranking, not
     * a directory.
     */
    listByTraceCount(
      input: ListOrganizationsByTraceCountInput,
    ): Effect.Effect<OrganizationsByTraceCountPage, RepositoryError>
  }
>()("@domain/admin/AdminOrganizationUsageRepository") {}
