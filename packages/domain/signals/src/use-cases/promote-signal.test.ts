import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  OrganizationId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { PROMOTION_MIN_SESSIONS } from "../constants.ts"
import type { Signal, SignalScoreEvidence } from "../entities/signal.ts"
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
  scoreEvidence: [],
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
  (name: string, description: string, scoreEvidence: SignalScoreEvidence[] = []): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({ object: input.schema.parse({ name, description, scoreEvidence }), tokens: 10, duration: 5 })

const promotionGateLayers = (projectSessions = 500) => {
  const cache: CacheStoreShape = {
    get: () => Effect.succeed(String(projectSessions)),
    set: () => Effect.void,
    delete: () => Effect.void,
  }
  const { repository: sessionRepository } = createFakeSessionRepository({
    countByProjectId: () => Effect.succeed({ totalCount: projectSessions }),
  })

  return [
    Effect.provideService(CacheStore, cache),
    Effect.provideService(SessionRepository, sessionRepository),
    Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
  ] as const
}

const run = (input: {
  readonly signal?: Signal
  readonly generate?: AIGenerate
  readonly sessions?: number
  readonly projectSessions?: number
  readonly flaggerSlugSample?: readonly (string | null)[]
}) => {
  const { layer: aiLayer } = createFakeAI(
    input.generate ? { generate: input.generate } : { generate: () => Effect.die("model unavailable") },
  )
  const { repository: signalRepository, issues } = createFakeSignalRepository([input.signal ?? makeSignal()])
  const { repository: scoreRepository } = createFakeScoreRepository({
    countDistinctSessionsBySignalId: () => Effect.succeed(input.sessions ?? PROMOTION_MIN_SESSIONS),
    listFlaggerSlugSampleBySignalId: () => Effect.succeed(input.flaggerSlugSample ?? []),
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
      ...promotionGateLayers(input.projectSessions),
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
    expect(stored?.scoreEvidence).toEqual([])

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
    expect(stored?.scoreEvidence).toEqual([])
    expect(outbox.events.filter((event) => event.eventName === "SignalPromoted")).toHaveLength(1)
  })

  it("uses static evidence for a dominant mapped flagger", async () => {
    const { stored } = await run({
      flaggerSlugSample: ["tool-call-errors", "tool-call-errors", "refusal"],
      generate: generated("Tool call failures", "Tools fail during execution."),
    })

    expect(stored?.scoreEvidence).toEqual([
      { scoreDimension: "reliability", role: "operationalIncident" },
      { scoreDimension: "cost", role: "spendEfficiency" },
      { scoreDimension: "speed", role: "criticalPathEfficiency" },
    ])
  })

  it("uses generated evidence without a dominant mapped flagger", async () => {
    const scoreEvidence: SignalScoreEvidence[] = [{ scoreDimension: "safety", role: "exposure" }]
    const { stored } = await run({
      flaggerSlugSample: ["unknown", "refusal", null],
      generate: generated("Unsafe input exposure", "User input contains sensitive content.", scoreEvidence),
    })

    expect(stored?.scoreEvidence).toEqual(scoreEvidence)
  })

  it("does not call the model when generation is switched off", async () => {
    // The worker clears the flag when billing refuses the call or the metering
    // scope cannot be built. The AI layer resolves that scope with
    // `serviceOption`, so generating anyway would run the model unmetered.
    const { layer: aiLayer, calls } = createFakeAI({
      generate: generated("Should never be requested", "Nor this."),
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository([makeSignal()])
    const { repository: scoreRepository } = createFakeScoreRepository({
      countDistinctSessionsBySignalId: () => Effect.succeed(PROMOTION_MIN_SESSIONS),
      listFlaggerSlugSampleBySignalId: () => Effect.succeed(["refusal", "refusal", null]),
    })
    const outbox: { events: OutboxWriteEvent[] } = { events: [] }

    const result = await Effect.runPromise(
      promoteSignalUseCase({ organizationId, projectId, signalId, generateDetails: false }).pipe(
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
        ...promotionGateLayers(),
      ),
    )

    expect(result.action).toBe("promoted")
    expect(calls.generate).toHaveLength(0)
    expect(issues.get(signalId)?.name).toBe(PLACEHOLDER_NAME)
    expect(issues.get(signalId)?.promotedAt).not.toBeNull()
    expect(issues.get(signalId)?.scoreEvidence).toEqual([{ scoreDimension: "outcome", role: "taskOutcome" }])
  })

  it("does not promote when evidence dropped below the threshold after qualification", async () => {
    const { result, outbox, stored } = await run({
      sessions: PROMOTION_MIN_SESSIONS - 1,
      generate: generated("Should never be written", "Nor this."),
    })

    expect(result.action).toBe("not-qualified")
    expect(stored?.name).toBe(PLACEHOLDER_NAME)
    expect(stored?.promotedAt).toBeNull()
    expect(outbox.events).toHaveLength(0)
  })

  it("locks matching scores when re-counting under the signal row lock", async () => {
    const lockedCounts: boolean[] = []
    const { layer: aiLayer } = createFakeAI({
      generate: generated("Token leakage in assistant responses", "Secrets reach the user verbatim."),
    })
    const { repository: signalRepository } = createFakeSignalRepository([makeSignal()])
    const { repository: scoreRepository } = createFakeScoreRepository({
      countDistinctSessionsBySignalId: (input) => {
        lockedCounts.push(input.forUpdate === true)
        return Effect.succeed(PROMOTION_MIN_SESSIONS)
      },
    })
    const outbox: { events: OutboxWriteEvent[] } = { events: [] }

    const result = await Effect.runPromise(
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
        ...promotionGateLayers(),
      ),
    )

    expect(result.action).toBe("promoted")
    expect(lockedCounts).toEqual([false, true])
    expect(outbox.events.filter((event) => event.eventName === "SignalPromoted")).toHaveLength(1)
  })

  it("does not stamp after a stale job if evidence disappears during naming", async () => {
    const counts = [PROMOTION_MIN_SESSIONS, PROMOTION_MIN_SESSIONS - 1]
    const { layer: aiLayer } = createFakeAI({
      generate: generated("Should never be written", "Nor this."),
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository([makeSignal()])
    const { repository: scoreRepository } = createFakeScoreRepository({
      countDistinctSessionsBySignalId: () => Effect.succeed(counts.shift() ?? 0),
    })
    const outbox: { events: OutboxWriteEvent[] } = { events: [] }

    const result = await Effect.runPromise(
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
        ...promotionGateLayers(),
      ),
    )

    expect(result.action).toBe("not-qualified")
    expect(issues.get(signalId)?.promotedAt).toBeNull()
    expect(outbox.events).toHaveLength(0)
  })

  it("is idempotent for an already-promoted signal", async () => {
    const promotedAt = new Date("2026-07-01T00:00:00Z")
    const scoreEvidence: SignalScoreEvidence[] = [{ scoreDimension: "cost", role: "spendEfficiency" }]
    const { result, outbox, stored } = await run({
      signal: { ...makeSignal(promotedAt), scoreEvidence },
      generate: generated("Should never be written", "Nor this."),
    })

    expect(result.action).toBe("already-promoted")
    expect(stored?.name).toBe(PLACEHOLDER_NAME)
    expect(stored?.promotedAt).toEqual(promotedAt)
    expect(stored?.scoreEvidence).toEqual(scoreEvidence)
    expect(outbox.events).toHaveLength(0)
  })
})
