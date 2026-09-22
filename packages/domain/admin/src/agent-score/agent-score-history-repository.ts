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
 * Separate from `AgentScoreSnapshotRepository` because the organization comes from the row rather
 * than the connection scope: same signature, different tenancy guarantee.
 */
export class AdminAgentScoreHistoryRepository extends Context.Service<
  AdminAgentScoreHistoryRepository,
  {
    /** Writes the snapshots whose dates are still free, and returns how many landed. */
    insertSnapshotsIfAbsent(snapshots: readonly AgentScoreSnapshot[]): Effect.Effect<number, RepositoryError, SqlClient>
  }
>()("@domain/admin/AdminAgentScoreHistoryRepository") {}
