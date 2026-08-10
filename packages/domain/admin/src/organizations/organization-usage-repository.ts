import type { OrganizationId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/** Per-organisation slice of trace activity inside the rolling usage window. */
export interface AdminOrganizationUsageRow {
  readonly organizationId: OrganizationId
  readonly traceCount: number
  readonly lastTraceAt: Date | null
}

export interface FindOrganizationUsageByIdsInput {
  readonly organizationIds: readonly OrganizationId[]
  /** Inclusive lower bound on trace start time. */
  readonly since: Date
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
export class AdminOrganizationUsageRepository extends Context.Service<
  AdminOrganizationUsageRepository,
  {
    /**
     * Aggregate traces ingested at or after `since` for the given
     * organisations. Orgs with no traces in the window are absent from
     * the returned map (callers treat missing as zero).
     */
    findManyByOrganizationIds(
      input: FindOrganizationUsageByIdsInput,
    ): Effect.Effect<ReadonlyMap<OrganizationId, AdminOrganizationUsageRow>, RepositoryError>
  }
>()("@domain/admin/AdminOrganizationUsageRepository") {}
