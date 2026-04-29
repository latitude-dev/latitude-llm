import { OrganizationId, ProjectId } from "@domain/shared"
import { createSeedScope, type SeedScope } from "@domain/shared/seeding"
import { seedDemoProjectClickHouse } from "@platform/db-clickhouse"
import { seedDemoProjectPostgres } from "@platform/db-postgres"
import { seedDemoProjectWeaviate } from "@platform/db-weaviate"
import { getClickhouseClient, getPostgresClient, getWeaviateClient } from "../clients.ts"

/**
 * Plain-data input that the workflow hands every activity. Workflow code
 * must be deterministic across replays, so the random queue assignee is
 * picked in the request handler (server function → use-case) and threaded
 * through here as an array.
 *
 * `timelineAnchorIso` is captured at workflow-start time so all three
 * datastores end up with seeded rows pinned to the same "now". Using
 * `new Date()` inside an activity would drift between retries.
 */
export interface SeedDemoProjectActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly queueAssigneeUserIds: readonly string[]
  readonly timelineAnchorIso: string
}

const buildScope = (input: SeedDemoProjectActivityInput): SeedScope =>
  createSeedScope({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    timelineAnchor: new Date(input.timelineAnchorIso),
    queueAssigneeUserIds: [...input.queueAssigneeUserIds],
  })

/**
 * Postgres content seed: datasets, evaluations, issues, simulations,
 * scores, annotation queues + items.
 *
 * Bootstrap-only seeders (org/users/api-keys/projects rows) are
 * intentionally skipped — the demo path operates on an existing org
 * with an existing API key, and the project row was created by the
 * use-case before this workflow started.
 */
export const seedDemoProjectPostgresActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  seedDemoProjectPostgres({ client: getPostgresClient(), scope: buildScope(input) })

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
