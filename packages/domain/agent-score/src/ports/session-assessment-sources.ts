import type { SessionMomentLabel, SessionSemanticMoment } from "@domain/conversation-intelligence"
import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { Score } from "@domain/scores"
import type { NotFoundError, OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import type { SignalWithLifecycle } from "@domain/signals"
import type { SessionDetail, Span } from "@domain/spans"
import { Context, type Effect } from "effect"

export interface SessionAssessmentSourceScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly cutoff: Date
}

export interface SessionAssessmentTraceScope extends SessionAssessmentSourceScope {
  readonly traceIds: readonly TraceId[]
}

export interface SessionMomentFacts {
  readonly moments: readonly SessionSemanticMoment[]
  readonly labels: readonly SessionMomentLabel[]
}

export interface SessionConversationSourceShape {
  read(input: SessionAssessmentSourceScope): Effect.Effect<SessionDetail, NotFoundError | RepositoryError>
}

export class SessionConversationSource extends Context.Service<
  SessionConversationSource,
  SessionConversationSourceShape
>()("@domain/agent-score/SessionConversationSource") {}

export interface SessionSpanSourceShape {
  read(input: SessionAssessmentTraceScope): Effect.Effect<readonly Span[], RepositoryError>
}

export class SessionSpanSource extends Context.Service<SessionSpanSource, SessionSpanSourceShape>()(
  "@domain/agent-score/SessionSpanSource",
) {}

export interface SessionScoreSourceShape {
  read(input: SessionAssessmentTraceScope): Effect.Effect<readonly Score[], RepositoryError>
}

export class SessionScoreSource extends Context.Service<SessionScoreSource, SessionScoreSourceShape>()(
  "@domain/agent-score/SessionScoreSource",
) {}

export interface SessionSignalSourceShape {
  read(input: SessionAssessmentTraceScope): Effect.Effect<readonly SignalWithLifecycle[], RepositoryError>
}

export class SessionSignalSource extends Context.Service<SessionSignalSource, SessionSignalSourceShape>()(
  "@domain/agent-score/SessionSignalSource",
) {}

export interface SessionMomentSourceShape {
  read(input: SessionAssessmentTraceScope): Effect.Effect<SessionMomentFacts, RepositoryError>
}

export class SessionMomentSource extends Context.Service<SessionMomentSource, SessionMomentSourceShape>()(
  "@domain/agent-score/SessionMomentSource",
) {}

export interface SessionScreeningDecisionSourceShape {
  read(input: SessionAssessmentTraceScope): Effect.Effect<readonly FlaggerScreeningDecision[], RepositoryError>
}

export class SessionScreeningDecisionSource extends Context.Service<
  SessionScreeningDecisionSource,
  SessionScreeningDecisionSourceShape
>()("@domain/agent-score/SessionScreeningDecisionSource") {}
