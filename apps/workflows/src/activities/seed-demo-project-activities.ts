import { ApiKeyId, OrganizationId, ProjectId } from "@domain/shared"
import { createSeedScope, type SeedScope } from "@domain/shared/seeding"
import { seedDemoProjectClickHouse } from "@platform/db-clickhouse"
import { seedDemoProjectPostgres } from "@platform/db-postgres"
import { seedDemoProjectWeaviate } from "@platform/db-weaviate"
import { getAdminPostgresClient, getClickhouseClient, getWeaviateClient } from "../clients.ts"

/**
 * Plain-data input that the workflow hands every activity. Workflow code
 * must be deterministic across replays, so the random queue assignee +
 * api-key lookup happen in the request handler (server function →
 * use-case) and arrive here as plain strings.
 *
 * `timelineAnchorIso` is captured at workflow-start time so all three
 * datastores end up with seeded rows pinned to the same "now". Using
 * `new Date()` inside an activity would drift between retries.
 */
export interface SeedDemoProjectActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly queueAssigneeUserIds: readonly string[]
  readonly apiKeyId: string
  readonly timelineAnchorIso: string
}

const buildScope = (input: SeedDemoProjectActivityInput): SeedScope =>
  createSeedScope({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    timelineAnchor: new Date(input.timelineAnchorIso),
    queueAssigneeUserIds: [...input.queueAssigneeUserIds],
    apiKeyId: ApiKeyId(input.apiKeyId),
  })

/**
 * Postgres content seed: datasets, evaluations, issues, simulations,
 * scores, annotation queues + items.
 *
 * Bootstrap-only seeders (org/users/api-keys/projects rows) are
 * intentionally skipped — the demo path operates on an existing org
 * with an existing API key, and the project row was created by the
 * use-case before this workflow started.
 *
 * Uses the admin (RLS-bypass) postgres client for the same reason
 * `pnpm seed` does: the seeders write across many tables guarded by
 * `organization_id = get_current_organization_id()` policies via the
 * bare drizzle client (no `SqlClient.transaction` to set the RLS
 * context), so the standard role's policies would reject every
 * insert. Same trade-off the bootstrap CLI already makes.
 */
export const seedDemoProjectPostgresActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  seedDemoProjectPostgres({ client: getAdminPostgresClient(), scope: buildScope(input) })

/**
 * ClickHouse content seed: ambient telemetry (~30 days × 6 agents),
 * deterministic span fixtures, score-mirror rows, dataset rows.
 * Depends on the Postgres seed (issue / evaluation / score ids) only by
 * way of the shared `SeedScope` — both sides resolve through the same
 * keys.
 */
export const seedDemoProjectClickHouseActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  seedDemoProjectClickHouse({ client: getClickhouseClient(), scope: buildScope(input) })

/**
 * Weaviate content seed: issue projections, derived from the Postgres
 * issue rows the upstream activity wrote.
 */
export const seedDemoProjectWeaviateActivity = async (input: SeedDemoProjectActivityInput): Promise<void> => {
  const client = await getWeaviateClient()
  await seedDemoProjectWeaviate({ client, scope: buildScope(input) })
}
