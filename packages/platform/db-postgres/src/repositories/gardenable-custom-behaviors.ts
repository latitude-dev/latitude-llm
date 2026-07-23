import { and, eq, isNull, lt, or, sql } from "drizzle-orm"
import type { PostgresClient } from "../client.ts"
import { customBehaviors } from "../schema/custom-behaviors.ts"
import { projects } from "../schema/projects.ts"

export interface GardenableCustomBehaviorRef {
  readonly organization_id: string
  readonly project_id: string
  readonly custom_behavior_id: string
}

/**
 * Cross-org list of custom behaviors the scoped-gardening sweep should enqueue:
 * on a live project (not soft-deleted, not demo/showcase — same exclusions as
 * `listGardenableProjectRefs`), and either never gardened or last gardened
 * before `gardenedBefore` (the cadence throttle). Every custom behavior gardens
 * for its whole lifetime — deleting it is the only off switch — so there is no
 * enabled flag to check. A null `last_gardened_at` is eligible: a freshly
 * created behavior is swept even before its create-time run stamps a timestamp.
 *
 * ⚠️ Runs without an `organization_id` filter — pass the admin (RLS-bypass)
 * client so it sees every organization's behaviors.
 */
export const listGardenableCustomBehaviors = async (
  adminClient: PostgresClient,
  input: { readonly gardenedBefore: Date },
): Promise<GardenableCustomBehaviorRef[]> =>
  adminClient.db
    .select({
      organization_id: customBehaviors.organizationId,
      project_id: customBehaviors.projectId,
      custom_behavior_id: customBehaviors.id,
    })
    .from(customBehaviors)
    .innerJoin(projects, eq(projects.id, customBehaviors.projectId))
    .where(
      and(
        isNull(projects.deletedAt),
        sql`coalesce((${projects.settings} ->> 'isSample')::boolean, false) = false`,
        sql`coalesce((${projects.settings} ->> 'isShowcase')::boolean, false) = false`,
        or(isNull(customBehaviors.lastGardenedAt), lt(customBehaviors.lastGardenedAt, input.gardenedBefore)),
      ),
    )
