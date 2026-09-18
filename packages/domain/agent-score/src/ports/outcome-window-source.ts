import type { FlaggerScreeningOutcome, FlaggerScreeningSelectionReason } from "@domain/flaggers"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface OutcomeWindowScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}

/**
 * The newest screening generation for one session, which is the only one that
 * counts. A pending, failed, or indeterminate newest generation leaves the
 * session unexamined; the reader never falls back to a successful older one.
 */
export interface OutcomeWindowDecision {
  readonly sessionId: SessionId
  readonly analysisHash: string
  readonly selected: boolean
  readonly reason: FlaggerScreeningSelectionReason
  readonly inclusionProbability?: number
  readonly outcome?: FlaggerScreeningOutcome
}

export interface OutcomeWindowDecisions {
  /** Production sessions in the window, which is the denominator coverage is measured against. */
  readonly eligibleSessionCount: number
  readonly decisions: readonly OutcomeWindowDecision[]
}

export interface OutcomeWindowDecisionSourceShape {
  read(scope: OutcomeWindowScope): Effect.Effect<OutcomeWindowDecisions, RepositoryError, ChSqlClient>
}

export class OutcomeWindowDecisionSource extends Context.Service<
  OutcomeWindowDecisionSource,
  OutcomeWindowDecisionSourceShape
>()("@domain/agent-score/OutcomeWindowDecisionSource") {}
