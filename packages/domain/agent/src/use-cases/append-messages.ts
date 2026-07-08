import { type AgentSessionId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AgentMessagePart, AgentMessageRecord, AgentMessageRole } from "../entities/message.ts"
import { AgentMessageRepository } from "../ports/message-repository.ts"

export interface AppendMessagesInput {
  readonly sessionId: AgentSessionId
  readonly messages: ReadonlyArray<{
    readonly role: AgentMessageRole
    readonly parts: ReadonlyArray<AgentMessagePart>
  }>
}

/** Appends the assistant + tool messages a turn produced, preserving order, in one transaction. */
export const appendMessagesUseCase = Effect.fn("agent.appendMessages")(function* (input: AppendMessagesInput) {
  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const messageRepo = yield* AgentMessageRepository
      const records: AgentMessageRecord[] = []
      for (const message of input.messages) {
        records.push(
          yield* messageRepo.append({ sessionId: input.sessionId, role: message.role, parts: message.parts }),
        )
      }
      return records
    }),
  )
})
