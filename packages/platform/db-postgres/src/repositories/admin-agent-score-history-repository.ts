import { AdminAgentScoreHistoryRepository } from "@domain/admin"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { toAgentScoreSnapshotInsertRow } from "./agent-score-snapshot-repository.ts"

/**
 * Live layer for the backoffice Agent Score history seeder.
 *
 * ⚠️ SECURITY: this is the only writer that files a score under an `organization_id` taken from the
 * row rather than from the connection. Every other snapshot write overrides that column with the
 * SqlClient's tenant scope, which is what makes it impossible to publish a score into the wrong
 * tenant by accident. Here there is no scope to override with — the admin pool runs as
 * `OrganizationId("system")` (the default on `getAdminPostgresClient()`) so RLS is bypassed — and
 * the organization instead comes from the project lookup the handler already performed. Never
 * provide this layer on the standard app-facing Postgres client, and never accept an organization
 * id straight from a request: resolve it from the project.
 */
export const AdminAgentScoreHistoryRepositoryLive = Layer.succeed(AdminAgentScoreHistoryRepository, {
  insertSnapshotsIfAbsent: (snapshots) =>
    Effect.gen(function* () {
      if (snapshots.length === 0) return 0
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      // One statement with `doNothing` on the unique key rather than a read-then-write per date: the
      // dates a real score already holds are skipped by the index, so seeding can never overwrite
      // measured history no matter what the client asked for. The returned rows are the ones that
      // actually landed, which is what the modal reports back.
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
