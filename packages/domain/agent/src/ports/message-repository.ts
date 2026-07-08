import type { AgentMessageId, AgentSessionId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AgentMessagePart, AgentMessageRecord, AgentMessageRole } from "../entities/message.ts"

export interface AppendAgentMessageRepoInput {
  readonly id?: AgentMessageId
  readonly sessionId: AgentSessionId
  readonly role: AgentMessageRole
  readonly parts: ReadonlyArray<AgentMessagePart>
}

export interface AgentMessageRepositoryShape {
  /** Appends a message, allocating the next per-session `seq` atomically within the current transaction. */
  append(args: AppendAgentMessageRepoInput): Effect.Effect<AgentMessageRecord, RepositoryError, SqlClient>
  /** All messages for a session ordered by ascending `seq`. */
  listBySession(sessionId: AgentSessionId): Effect.Effect<readonly AgentMessageRecord[], RepositoryError, SqlClient>
}

export class AgentMessageRepository extends Context.Service<AgentMessageRepository, AgentMessageRepositoryShape>()(
  "@domain/agent/AgentMessageRepository",
) {}
