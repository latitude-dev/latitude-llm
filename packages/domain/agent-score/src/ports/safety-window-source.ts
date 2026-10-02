import type { FlaggerScreeningOutcome, FlaggerScreeningSelectionReason } from "@domain/flaggers"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface SafetyWindowScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
  readonly suiteSlugs: readonly string[]
}

/**
 * The newest screening generation one suite member reached for one session.
 *
 * Each member is collapsed on its own, so a session whose members answered in
 * different generations arrives with two analysis hashes and the estimator can
 * reject it as an incomplete suite rather than pooling halves of two runs.
 */
export interface SafetyWindowDecision {
  readonly sessionId: SessionId
  readonly flaggerSlug: string
  readonly analysisHash: string
  readonly selected: boolean
  readonly reason: FlaggerScreeningSelectionReason
  readonly inclusionProbability?: number
  readonly outcome?: FlaggerScreeningOutcome
  readonly hintKinds: readonly string[]
}

export interface SafetyWindowDecisions {
  /** Production sessions in the window, which is the denominator coverage is measured against. */
  readonly eligibleSessionCount: number
  readonly decisions: readonly SafetyWindowDecision[]
}

export interface SafetyWindowDecisionSourceShape {
  read(scope: SafetyWindowScope): Effect.Effect<SafetyWindowDecisions, RepositoryError, ChSqlClient>
}

export class SafetyWindowDecisionSource extends Context.Service<
  SafetyWindowDecisionSource,
  SafetyWindowDecisionSourceShape
>()("@domain/agent-score/SafetyWindowDecisionSource") {}
