import { type AgentSessionId, type ProjectId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentMessageRecord } from "../entities/message.ts"
import type { AgentSession } from "../entities/session.ts"
import { AgentMessageRepository } from "../ports/message-repository.ts"
import { AgentSessionRepository } from "../ports/session-repository.ts"

export interface StartTurnInput {
  /** Omit to start a new session; provide to continue an existing one. */
  readonly sessionId?: AgentSessionId
  readonly userId: UserId
  readonly projectId: ProjectId | null
  readonly title?: string | null
  /** The user's message text for this turn. */
  readonly text: string
}

export interface StartTurnResult {
  readonly session: AgentSession
  readonly userMessage: AgentMessageRecord
}

/**
 * Opens or continues a chat session and records the user's message, atomically.
 * The turn itself runs asynchronously in the worker off the enqueued job.
 */
export const startTurnUseCase = Effect.fn("agent.startTurn")(function* (input: StartTurnInput) {
  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const sessionRepo = yield* AgentSessionRepository
      const messageRepo = yield* AgentMessageRepository

      const session = yield* input.sessionId
        ? sessionRepo.findById(input.sessionId).pipe(Effect.tap(() => sessionRepo.touch(input.sessionId!)))
        : sessionRepo.create({ userId: input.userId, projectId: input.projectId, title: input.title ?? null })

      const userMessage = yield* messageRepo.append({
        sessionId: session.id,
        role: "user",
        parts: [{ type: "text", text: input.text }],
      })

      return { session, userMessage } satisfies StartTurnResult
    }),
  )
})
