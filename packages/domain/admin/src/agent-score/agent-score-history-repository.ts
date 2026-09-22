import type { AgentScoreSnapshot } from "@domain/agent-score"
import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Cross-organization write port for seeding Agent Score history.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB connection — see
 * `AdminAgentScoreHistoryRepositoryLive` in `@platform/db-postgres`. Only wired into handlers that
 * have passed `adminMiddleware` in `apps/web`.
 *
 * It exists as its own port rather than as a method on `AgentScoreSnapshotRepository` because of
 * where the organization comes from. The tenant-facing adapter takes it from the connection scope,
 * which is how a snapshot cannot be written into the wrong tenant even by a miswired job. A
 * backoffice handler has no such scope — the admin pool runs as `"system"` — so seeding has to name
 * the organization in the row itself, and that is a different guarantee wearing the same signature.
 * Splitting the ports keeps a reader from assuming either one behaves like the other.
 */
export class AdminAgentScoreHistoryRepository extends Context.Service<
  AdminAgentScoreHistoryRepository,
  {
    /**
     * Writes the snapshots whose dates are still free, and returns how many landed.
     *
     * Dates that already carry a published score are skipped, not overwritten: the whole point of
     * seeding is to fill the gaps around real history without touching it.
     */
    insertSnapshotsIfAbsent(snapshots: readonly AgentScoreSnapshot[]): Effect.Effect<number, RepositoryError, SqlClient>
  }
>()("@domain/admin/AdminAgentScoreHistoryRepository") {}
