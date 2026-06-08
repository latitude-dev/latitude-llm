import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SessionAnalysis } from "../entities/session-analysis.ts"

export interface SessionAnalysisRepositoryShape {
  findLatest(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }): Effect.Effect<SessionAnalysis | null, RepositoryError, ChSqlClient>
  upsert(analysis: SessionAnalysis): Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class SessionAnalysisRepository extends Context.Service<
  SessionAnalysisRepository,
  SessionAnalysisRepositoryShape
>()("@domain/conversation-intelligence/SessionAnalysisRepository") {}
