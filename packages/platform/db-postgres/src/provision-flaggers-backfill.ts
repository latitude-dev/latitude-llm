import { provisionFlaggersUseCase } from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresClient } from "./client.ts"
import { FlaggerRepositoryLive } from "./repositories/flagger-repository.ts"
import { projects } from "./schema/projects.ts"
import { withPostgres } from "./with-postgres.ts"

interface ProvisionFlaggersBackfillResult {
  readonly projectCount: number
  readonly provisionedCount: number
  readonly failedProjectIds: readonly string[]
}

/**
 * Provisions every registered flagger slug for every live project.
 *
 * A slug that ships after a project was created has no `flaggers` row, and
 * screening drops a missing row as `missing-flagger`, so the detector stays
 * inert on that project until someone opens Settings. For a scoring flagger
 * that means the dimension it feeds is permanently unmeasured. Run this once
 * after the deploy that adds a slug.
 *
 * Idempotent: the repository upserts on the (organization, project, slug)
 * unique index, so a re-run costs one conflicting insert per existing row and
 * changes nothing. Existing rows keep their enabled state and sampling rate.
 */
export const provisionFlaggersForAllProjects = async (
  client: PostgresClient,
): Promise<ProvisionFlaggersBackfillResult> => {
  const rows = await client.db
    .select({ organizationId: projects.organizationId, projectId: projects.id })
    .from(projects)
    .where(isNull(projects.deletedAt))

  const failedProjectIds: string[] = []
  let provisionedCount = 0

  for (const row of rows) {
    try {
      const provisioned = await Effect.runPromise(
        provisionFlaggersUseCase({
          organizationId: row.organizationId,
          projectId: ProjectId(row.projectId),
        }).pipe(withPostgres(FlaggerRepositoryLive, client, OrganizationId(row.organizationId))),
      )
      provisionedCount += provisioned.length
    } catch {
      // One unreadable project must not abandon the rest of the backfill; the
      // caller reports the ids so a re-run can be scoped to them.
      failedProjectIds.push(row.projectId)
    }
  }

  return { projectCount: rows.length, provisionedCount, failedProjectIds }
}
