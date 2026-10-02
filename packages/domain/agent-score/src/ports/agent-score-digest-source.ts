import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface AgentScoreDigestCandidate {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Newest published date inside the window, `YYYY-MM-DD`. */
  readonly latestDate: string
}

export interface AgentScoreDigestScope {
  /** Inclusive UTC date bounds, `YYYY-MM-DD`. */
  readonly from: string
  readonly to: string
  /**
   * Organizations the digest is enabled for. Absent means every organization, which is what a
   * flag enabled for all resolves to — the eligibility read does not enumerate the fleet to say so.
   */
  readonly organizationIds?: readonly OrganizationId[] | undefined
}

export interface AgentScoreDigestSourceShape {
  /**
   * Projects that published at least one score in the window, with the newest date each reached.
   *
   * Published rather than eligible: a project can clear the session floor every day and still
   * publish nothing, because a dimension that misses its coverage floor withholds the whole
   * composite and writes no row. The ClickHouse sweep source answers the eligibility question; only
   * the stored snapshots answer this one.
   */
  listProjectsWithPublishedScores(
    scope: AgentScoreDigestScope,
  ): Effect.Effect<readonly AgentScoreDigestCandidate[], RepositoryError, SqlClient>
}

/**
 * The weekly digest's project list.
 *
 * WARNING: adapters read across every organization, so they MUST run under an admin (RLS-bypassing)
 * connection — see `AgentScoreDigestSourceLive` in `@platform/db-postgres`. Never provide it on the
 * app-facing Postgres client.
 */
export class AgentScoreDigestSource extends Context.Service<AgentScoreDigestSource, AgentScoreDigestSourceShape>()(
  "@domain/agent-score/AgentScoreDigestSource",
) {}
