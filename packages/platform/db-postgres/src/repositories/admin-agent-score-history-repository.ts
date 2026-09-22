import { AdminAgentScoreHistoryRepository } from "@domain/admin"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { toAgentScoreSnapshotInsertRow } from "./agent-score-snapshot-repository.ts"

/**
 * Live layer for the backoffice Agent Score history seeder.
 *
 * ⚠️ SECURITY: the only writer that files a score under an `organization_id` taken from the row
 * rather than from the connection, because the admin pool has no tenant scope to override it with
 * (`OrganizationId("system")`, the default on `getAdminPostgresClient()`, so RLS is bypassed).
 * Never provide this layer on the app-facing Postgres client, and never take the organization id
 * from a request: resolve it from the project.
 */
export const AdminAgentScoreHistoryRepositoryLive = Layer.succeed(AdminAgentScoreHistoryRepository, {
  insertSnapshotsIfAbsent: (snapshots) =>
    Effect.gen(function* () {
      if (snapshots.length === 0) return 0
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      // `doNothing` on the unique key, so dates a real score already holds are skipped by the index
      // rather than by trusting the caller.
      const inserted = yield* sqlClient.query((db) =>
        db
          .insert(agentScoreSnapshots)
          .values(snapshots.map(toAgentScoreSnapshotInsertRow))
          .onConflictDoNothing({
            target: [agentScoreSnapshots.organizationId, agentScoreSnapshots.projectId, agentScoreSnapshots.date],
          })
          .returning({ id: agentScoreSnapshots.id }),
      )
      return inserted.length
    }).pipe(Effect.mapError((error) => toRepositoryError(error, "AdminAgentScoreHistoryRepository.insertSnapshots"))),
})
