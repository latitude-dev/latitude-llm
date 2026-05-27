import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ConversationSessionAnalysis } from "../entities/session-analysis.ts"

export interface ConversationSessionAnalysisRepositoryShape {
  findLatest(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }): Effect.Effect<ConversationSessionAnalysis | null, RepositoryError, ChSqlClient>
  upsert(analysis: ConversationSessionAnalysis): Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class ConversationSessionAnalysisRepository extends Context.Service<
  ConversationSessionAnalysisRepository,
  ConversationSessionAnalysisRepositoryShape
>()("@domain/conversation-intelligence/ConversationSessionAnalysisRepository") {}
