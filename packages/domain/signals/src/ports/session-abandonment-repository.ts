import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface SessionAbandonmentRepositoryShape {
  /**
   * Earliest message index at which each of these sessions was seen being
   * abandoned, keyed by session id. Sessions with no abandonment — and sessions
   * conversation intelligence never analysed — are simply absent.
   *
   * The distinction matters when reading a miss: roughly 12% of signal-bearing
   * sessions carry no usable analysis, either because nobody was in the loop
   * (an unattended agent has no user to walk away) or because analysis skipped
   * them. So an absent session means "no evidence", never "the user was fine".
   *
   * Declared here rather than taken from `@domain/conversation-intelligence`,
   * which owns the labels: signals does not depend on that package, and neither
   * does the ClickHouse package depend on signals. Adding either edge
   * re-resolves the lockfile against the release-age gate for one read, so the
   * query ships as a bare function (`listAbandonmentIndexBySession`) and the
   * workers bind it to this tag.
   */
  listAbandonmentIndexBySession(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionIds: readonly string[]
  }): Effect.Effect<ReadonlyMap<string, number>, RepositoryError, ChSqlClient>
}

export class SessionAbandonmentRepository extends Context.Service<
  SessionAbandonmentRepository,
  SessionAbandonmentRepositoryShape
>()("@domain/signals/SessionAbandonmentRepository") {}
