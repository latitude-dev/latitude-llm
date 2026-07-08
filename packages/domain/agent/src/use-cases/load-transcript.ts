import type { AgentSessionId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentMessageRecord } from "../entities/message.ts"
import type { AgentSession } from "../entities/session.ts"
import { AgentMessageRepository } from "../ports/message-repository.ts"
import { AgentSessionRepository } from "../ports/session-repository.ts"

export interface LoadTranscriptResult {
  readonly session: AgentSession
  readonly messages: readonly AgentMessageRecord[]
}

/** Loads a session and its full ordered message transcript for reopen/hydration and the worker. */
export const loadTranscriptUseCase = Effect.fn("agent.loadTranscript")(function* (sessionId: AgentSessionId) {
  const sessionRepo = yield* AgentSessionRepository
  const messageRepo = yield* AgentMessageRepository
  const session = yield* sessionRepo.findById(sessionId)
  const messages = yield* messageRepo.listBySession(sessionId)
  return { session, messages } satisfies LoadTranscriptResult
})
