import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ConversationSemanticMoment } from "../entities/semantic-moment.ts"

export interface ConversationSemanticMomentRepositoryShape {
  readonly upsertMany: (
    moments: readonly ConversationSemanticMoment[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listBySession: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }) => Effect.Effect<readonly ConversationSemanticMoment[], RepositoryError, ChSqlClient>
  readonly listByTrace: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }) => Effect.Effect<readonly ConversationSemanticMoment[], RepositoryError, ChSqlClient>
}

export class ConversationSemanticMomentRepository extends Context.Service<
  ConversationSemanticMomentRepository,
  ConversationSemanticMomentRepositoryShape
>()("@domain/conversation-intelligence/ConversationSemanticMomentRepository") {}
