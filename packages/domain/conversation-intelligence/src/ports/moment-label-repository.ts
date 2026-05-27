import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ConversationMomentLabel } from "../entities/moment-label.ts"

export interface ConversationMomentLabelRepositoryShape {
  readonly upsertMany: (labels: readonly ConversationMomentLabel[]) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listBySession: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }) => Effect.Effect<readonly ConversationMomentLabel[], RepositoryError, ChSqlClient>
  readonly listByMoment: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly momentId: string
  }) => Effect.Effect<readonly ConversationMomentLabel[], RepositoryError, ChSqlClient>
}

export class ConversationMomentLabelRepository extends Context.Service<
  ConversationMomentLabelRepository,
  ConversationMomentLabelRepositoryShape
>()("@domain/conversation-intelligence/ConversationMomentLabelRepository") {}
