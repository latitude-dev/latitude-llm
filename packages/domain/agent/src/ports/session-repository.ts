import type { AgentSessionId, ProjectId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AgentSession } from "../entities/session.ts"
import type { AgentSessionNotFoundError } from "../errors.ts"

export interface CreateAgentSessionRepoInput {
  readonly id?: AgentSessionId
  readonly userId: UserId
  readonly projectId: ProjectId | null
  readonly title?: string | null
}

export interface AgentSessionRepositoryShape {
  create(args: CreateAgentSessionRepoInput): Effect.Effect<AgentSession, RepositoryError, SqlClient>
  findById(id: AgentSessionId): Effect.Effect<AgentSession, AgentSessionNotFoundError | RepositoryError, SqlClient>
  /** Bumps `updatedAt` so recency ordering reflects the latest turn. */
  touch(id: AgentSessionId): Effect.Effect<void, AgentSessionNotFoundError | RepositoryError, SqlClient>
  listByUser(args: {
    readonly userId: UserId
    readonly limit: number
  }): Effect.Effect<readonly AgentSession[], RepositoryError, SqlClient>
}

export class AgentSessionRepository extends Context.Service<AgentSessionRepository, AgentSessionRepositoryShape>()(
  "@domain/agent/AgentSessionRepository",
) {}
