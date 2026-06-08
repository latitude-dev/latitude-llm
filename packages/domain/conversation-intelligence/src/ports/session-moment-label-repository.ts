import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SessionMomentLabel } from "../entities/session-moment-label.ts"

export interface SessionMomentLabelRepositoryShape {
  readonly upsertMany: (labels: readonly SessionMomentLabel[]) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listBySession: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }) => Effect.Effect<readonly SessionMomentLabel[], RepositoryError, ChSqlClient>
  readonly listByMoment: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly momentId: string
  }) => Effect.Effect<readonly SessionMomentLabel[], RepositoryError, ChSqlClient>
}

export class SessionMomentLabelRepository extends Context.Service<
  SessionMomentLabelRepository,
  SessionMomentLabelRepositoryShape
>()("@domain/conversation-intelligence/SessionMomentLabelRepository") {}
