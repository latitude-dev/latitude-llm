import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ScoreWindowStepCount } from "../scoring/select-score-window.ts"

export interface ScoreWindowCountsScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The snapshot cutoff. Every step ends here and reaches back its own length. */
  readonly to: Date
  readonly stepDays: readonly number[]
}

export interface ScoreWindowSessionsScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}

export interface ScoreWindowSourceShape {
  /**
   * Eligible-session counts for every candidate step, from one read.
   *
   * All four steps end at the same cutoff and differ only in how far back they reach, so counting
   * them separately would scan the longest window four times to answer one question.
   */
  readEligibleCounts(
    scope: ScoreWindowCountsScope,
  ): Effect.Effect<readonly ScoreWindowStepCount[], RepositoryError, ChSqlClient>

  /** The eligible sessions of the chosen step, which is the population every dimension narrows. */
  readEligibleSessionIds(
    scope: ScoreWindowSessionsScope,
  ): Effect.Effect<readonly SessionId[], RepositoryError, ChSqlClient>
}

export class ScoreWindowSource extends Context.Service<ScoreWindowSource, ScoreWindowSourceShape>()(
  "@domain/agent-score/ScoreWindowSource",
) {}

export interface ScoreSweepProject {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Eligible sessions over the longest step, which is the most any window for this project can see. */
  readonly eligibleSessions: number
}

export interface ScoreSweepScope {
  readonly to: Date
  readonly maxStepDays: number
  /** Projects below the floor cannot publish under any step, so the sweep does not fan out to them. */
  readonly sessionFloor: number
}

export interface ScoreProjectSweepSourceShape {
  listProjects(scope: ScoreSweepScope): Effect.Effect<readonly ScoreSweepProject[], RepositoryError, ChSqlClient>
}

/**
 * The daily sweep's project list.
 *
 * WARNING: cross-tenant by design. It scans every organisation to decide who gets a snapshot task,
 * so it may only be provided under the system organisation sentinel and never alongside per-tenant
 * repositories on a request path. It returns identities and a count and nothing about any session.
 */
export class ScoreProjectSweepSource extends Context.Service<ScoreProjectSweepSource, ScoreProjectSweepSourceShape>()(
  "@domain/agent-score/ScoreProjectSweepSource",
) {}
