import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { promoteSignalUseCase } from "./promote-signal.ts"

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const PLACEHOLDER_NAME = "The assistant leaks API tokens in its response"

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeSignal = (promotedAt: Date | null = null): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "acme-0001",
  name: PLACEHOLDER_NAME,
  description: `${PLACEHOLDER_NAME}.`,
  source: "flagger",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  feedback: null,
  promotedAt,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

const generated =
  (name: string, description: string): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({ object: input.schema.parse({ name, description }), tokens: 10, duration: 5 })

const run = (input: { readonly signal?: Signal; readonly generate?: AIGenerate }) => {
  const { layer: aiLayer } = createFakeAI(
    input.generate ? { generate: input.generate } : { generate: () => Effect.die("model unavailable") },
  )
  const { repository: signalRepository, issues } = createFakeSignalRepository([input.signal ?? makeSignal()])
  const { repository: scoreRepository } = createFakeScoreRepository({
    listBySignalId: () =>
      Effect.succeed({
        items: [
          { ...makeSignal(), sourceType: "annotation", feedback: "Secrets appeared verbatim in the reply." },
          { ...makeSignal(), sourceType: "annotation", feedback: "The API token was echoed back to the user." },
        ] as never,
        hasMore: false,
        limit: 25,
        offset: 0,
      }),
  })
  const outbox: { events: OutboxWriteEvent[] } = { events: [] }

  return Effect.runPromise(
    promoteSignalUseCase({ organizationId, projectId, signalId }).pipe(
      Effect.provide(aiLayer),
      Effect.provideService(SignalRepository, signalRepository),
      Effect.provideService(ScoreRepository, scoreRepository),
      Effect.provideService(SqlClient, createPassthroughSqlClient()),
      Effect.provideService(
        OutboxEventWriter,
        OutboxEventWriter.of({
          write: (event) =>
            Effect.sync(() => {
              outbox.events.push(event)
            }),
        }),
      ),
    ),
  ).then((result) => ({ result, outbox, stored: issues.get(signalId) }))
}

describe("promoteSignalUseCase", () => {
  it("names the signal from its cluster, then stamps the latch and emits", async () => {
    const { result, outbox, stored } = await run({
      generate: generated("Token leakage in assistant responses", "Secrets reach the user verbatim."),
    })

    expect(result.action).toBe("promoted")
    expect(stored?.name).toBe("Token leakage in assistant responses")
    expect(stored?.promotedAt).not.toBeNull()

    // Emitted from the transaction that stamps the latch, so by the time anyone
    // consumes it the signal is visible AND carries its cluster's name — agent
    // dispatch builds its prompt from exactly these two fields.
    const promoted = outbox.events.filter((event) => event.eventName === "SignalPromoted")
    expect(promoted).toHaveLength(1)
    expect(promoted[0]?.payload).toMatchObject({ signalId: signalId as string })
  })

  it("promotes under the placeholder when generation fails", async () => {
    // Holding promotion back because a model call failed leaves the signal
    // invisible to everyone with nothing scheduled to retry it. The throttled
    // refresh corrects the name once the latch is set.
    const { result, outbox, stored } = await run({})

    expect(result.action).toBe("promoted")
    expect(stored?.name).toBe(PLACEHOLDER_NAME)
    expect(stored?.promotedAt).not.toBeNull()
    expect(outbox.events.filter((event) => event.eventName === "SignalPromoted")).toHaveLength(1)
  })

  it("is idempotent for an already-promoted signal", async () => {
    const promotedAt = new Date("2026-07-01T00:00:00Z")
    const { result, outbox, stored } = await run({
      signal: makeSignal(promotedAt),
      generate: generated("Should never be written", "Nor this."),
    })

    expect(result.action).toBe("already-promoted")
    expect(stored?.name).toBe(PLACEHOLDER_NAME)
    expect(stored?.promotedAt).toEqual(promotedAt)
    expect(outbox.events).toHaveLength(0)
  })
})
