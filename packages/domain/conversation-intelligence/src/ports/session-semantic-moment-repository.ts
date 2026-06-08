import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SessionSemanticMoment } from "../entities/session-semantic-moment.ts"

export interface SessionSemanticMomentRepositoryShape {
  readonly upsertMany: (moments: readonly SessionSemanticMoment[]) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listBySession: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
  }) => Effect.Effect<readonly SessionSemanticMoment[], RepositoryError, ChSqlClient>
  readonly listByTrace: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }) => Effect.Effect<readonly SessionSemanticMoment[], RepositoryError, ChSqlClient>
}

export class SessionSemanticMomentRepository extends Context.Service<
  SessionSemanticMomentRepository,
  SessionSemanticMomentRepositoryShape
>()("@domain/conversation-intelligence/SessionSemanticMomentRepository") {}
