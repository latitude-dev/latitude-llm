import { and, isNull, sql } from "drizzle-orm"
import type { PostgresClient } from "../client.ts"
import { projects } from "../schema/projects.ts"

export interface GardenableProjectRef {
  readonly organization_id: string
  readonly project_id: string
}

/**
 * Cross-org list of projects the taxonomy gardening sweep should consider:
 * not soft-deleted and not demo ("sample") projects. Demo projects are seeded
 * once from a curated snapshot; gardening them would re-cluster on the recent
 * lookback subset and drift the curated behaviours, so they're excluded.
 *
 * ⚠️ Runs without an `organization_id` filter — pass the admin (RLS-bypass)
 * client so it sees every organization's projects.
 */
export const listGardenableProjectRefs = async (adminClient: PostgresClient): Promise<GardenableProjectRef[]> =>
  adminClient.db
    .select({ organization_id: projects.organizationId, project_id: projects.id })
    .from(projects)
    .where(
      and(isNull(projects.deletedAt), sql`coalesce((${projects.settings} ->> 'isSample')::boolean, false) = false`),
    )
