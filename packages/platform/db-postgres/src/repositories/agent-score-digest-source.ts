import { AgentScoreDigestSource } from "@domain/agent-score"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, between, eq, inArray, isNull, max, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"

/**
 * Live layer for the weekly Agent Score digest's project list.
 *
 * ⚠️ SECURITY: reads across every organization, so it must be provided on the admin (RLS-bypassing)
 * connection — `getAdminPostgresClient()`, whose `OrganizationId("system")` default scope no policy
 * matches. Never wire it onto the app-facing Postgres client.
 *
 * The exclusions are each load-bearing rather than defensive. Snapshots outlive a soft-deleted
 * project. Sample and showcase projects carry seeded history published under the live scoring
 * version, which is indistinguishable from a real score once stored, so a digest would report
 * fabricated numbers. Sandbox organizations are dropped at send time anyway, and skipping them here
 * saves the fan-out.
 */
export const AgentScoreDigestSourceLive = Layer.succeed(AgentScoreDigestSource, {
  listProjectsWithPublishedScores: ({ from, to, organizationIds }) =>
    Effect.gen(function* () {
      if (organizationIds?.length === 0) return []

      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient.query((db) =>
        db
          .select({
            organizationId: agentScoreSnapshots.organizationId,
            projectId: agentScoreSnapshots.projectId,
            latestDate: max(agentScoreSnapshots.date),
          })
          .from(agentScoreSnapshots)
          .innerJoin(projects, eq(projects.id, agentScoreSnapshots.projectId))
          .innerJoin(organizations, eq(organizations.id, agentScoreSnapshots.organizationId))
          .where(
            and(
              between(agentScoreSnapshots.date, from, to),
              isNull(projects.deletedAt),
              isNull(organizations.parentOrgId),
              sql`coalesce((${projects.settings} ->> 'isSample')::boolean, false) = false`,
              sql`coalesce((${projects.settings} ->> 'isShowcase')::boolean, false) = false`,
              ...(organizationIds ? [inArray(agentScoreSnapshots.organizationId, [...organizationIds])] : []),
            ),
          )
          .groupBy(agentScoreSnapshots.organizationId, agentScoreSnapshots.projectId),
      )

      return rows.flatMap((row) =>
        row.latestDate === null
          ? []
          : [
              {
                organizationId: OrganizationId(row.organizationId),
                projectId: ProjectId(row.projectId),
                latestDate: row.latestDate,
              },
            ],
      )
    }).pipe(
      Effect.mapError((error) => toRepositoryError(error, "AgentScoreDigestSource.listProjectsWithPublishedScores")),
    ),
})
