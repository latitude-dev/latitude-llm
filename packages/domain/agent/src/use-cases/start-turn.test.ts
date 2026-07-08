import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { AgentMessageRepository } from "../ports/message-repository.ts"
import { AgentSessionRepository } from "../ports/session-repository.ts"
import { createFakeAgentMessageRepository } from "../testing/fake-message-repository.ts"
import { createFakeAgentSessionRepository } from "../testing/fake-session-repository.ts"
import { loadTranscriptUseCase } from "./load-transcript.ts"
import { startTurnUseCase } from "./start-turn.ts"

const USER_ID = UserId("uuuuuuuuuuuuuuuuuuuuuuuu")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const sqlClient: SqlClientShape = {
  organizationId: OrganizationId("oooooooooooooooooooooooo"),
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const provide = <A, E>(effect: Effect.Effect<A, E, SqlClient | AgentSessionRepository | AgentMessageRepository>) => {
  const sessions = createFakeAgentSessionRepository()
  const messages = createFakeAgentMessageRepository()
  return effect.pipe(
    Effect.provideService(SqlClient, sqlClient),
    Effect.provideService(AgentSessionRepository, sessions.repository),
    Effect.provideService(AgentMessageRepository, messages.repository),
  )
}

describe("startTurnUseCase", () => {
  it("creates a session and records the user message when no session exists", async () => {
    const result = await Effect.runPromise(
      provide(startTurnUseCase({ userId: USER_ID, projectId: PROJECT_ID, text: "hello" })),
    )

    expect(result.session.userId).toBe(USER_ID)
    expect(result.session.projectId).toBe(PROJECT_ID)
    expect(result.userMessage.role).toBe("user")
    expect(result.userMessage.seq).toBe(0)
    expect(result.userMessage.parts).toEqual([{ type: "text", text: "hello" }])
  })

  it("continues an existing session and appends transcript messages in order", async () => {
    const sessions = createFakeAgentSessionRepository()
    const messages = createFakeAgentMessageRepository()
    const wire = <A, E>(effect: Effect.Effect<A, E, SqlClient | AgentSessionRepository | AgentMessageRepository>) =>
      effect.pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(AgentSessionRepository, sessions.repository),
        Effect.provideService(AgentMessageRepository, messages.repository),
      )

    const first = await Effect.runPromise(wire(startTurnUseCase({ userId: USER_ID, projectId: null, text: "one" })))
    await Effect.runPromise(
      wire(startTurnUseCase({ sessionId: first.session.id, userId: USER_ID, projectId: null, text: "two" })),
    )

    const transcript = await Effect.runPromise(wire(loadTranscriptUseCase(first.session.id)))
    expect(transcript.messages.map((m) => m.seq)).toEqual([0, 1])
    expect(transcript.messages.map((m) => m.parts)).toEqual([
      [{ type: "text", text: "one" }],
      [{ type: "text", text: "two" }],
    ])
  })
})
