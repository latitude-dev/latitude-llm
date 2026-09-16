import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  ScoreId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository } from "@domain/shared/testing"
import { SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SIGNAL_BUNDLE_KEY_MAX_LENGTH } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { assignOrCreateSignalUseCase } from "./assign-or-create-signal-from-score.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const BUNDLE_KEY = "tool-call-errors:error:fetch_user:http-503"

const noopCache: CacheStoreShape = {
  get: () => Effect.succeed(null),
  set: () => Effect.void,
  delete: () => Effect.void,
}

const { repository: projectRepository } = createFakeProjectRepository([
  createProject({
    id: ProjectId(projectId),
    organizationId: OrganizationId(organizationId),
    name: "Acme",
    slug: "acme-signals",
  }),
])

const makeEmbedding = (seed: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === seed ? 1 : 0))

const makeScore = (id: string, overrides: Partial<AnnotationScore> = {}): AnnotationScore => ({
  id: ScoreId(id.padEnd(24, "s")),
  organizationId,
  projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  sourceType: "annotation",
  sourceId: "SYSTEM",
  simulationId: null,
  signalId: null,
  value: 0,
  passed: false,
  feedback: 'Tool "fetch_user" returned error: upstream 503',
  metadata: {
    rawFeedback: 'Tool "fetch_user" returned error: upstream 503',
    flaggerSlug: "tool-call-errors",
    flaggerBundleKey: BUNDLE_KEY,
  },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: new Date("2026-03-30T10:00:00.000Z"),
  updatedAt: new Date("2026-03-30T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const supportLayer = () =>
  Layer.mergeAll(
    Layer.succeed(CacheStore, noopCache),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
    Layer.succeed(SessionRepository, createFakeSessionRepository().repository),
    Layer.succeed(ProjectRepository, projectRepository),
    Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository),
  )

const runDiscovery = (input: {
  readonly scoreId: string
  readonly feedback: string
  readonly embeddingSeed: number
  readonly bundleKey?: string
  readonly scoreRepository: ReturnType<typeof createFakeScoreRepository>["repository"]
  readonly signalRepository: ReturnType<typeof createFakeSignalRepository>["repository"]
  readonly outbox: ReturnType<typeof createRecordingOutbox>["service"]
}) => {
  // The fake reranks nothing by default, which would make every fuzzy lookup miss.
  const { layer: aiLayer } = createFakeAI({
    rerank: ({ documents }) =>
      Effect.succeed(documents.map((_, index) => ({ index, relevanceScore: index === 0 ? 0.9 : 0.1 }))),
  })
  return Effect.runPromise(
    assignOrCreateSignalUseCase({
      organizationId,
      projectId,
      scoreId: input.scoreId,
      feedback: input.feedback,
      normalizedEmbedding: makeEmbedding(input.embeddingSeed),
      ...(input.bundleKey !== undefined ? { bundleKey: input.bundleKey } : {}),
    }).pipe(
      Effect.provide(aiLayer),
      Effect.provideService(ScoreRepository, input.scoreRepository),
      Effect.provideService(SignalRepository, input.signalRepository),
      Effect.provideService(SqlClient, createPassthroughSqlClient()),
      Effect.provideService(OutboxEventWriter, input.outbox),
      Effect.provide(supportLayer()),
    ),
  )
}

const createRecordingOutbox = () => {
  const events: OutboxWriteEvent[] = []
  return {
    events,
    service: OutboxEventWriter.of({
      write: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  }
}

describe("assignOrCreateSignalUseCase bundling", () => {
  it("lands every occurrence of one bucket on one issue, without consulting the embedding search", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const hybridSearchCalls: string[] = []
    const { repository: signalRepository, issues } = createFakeSignalRepository([], {
      hybridSearch: ({ query }) =>
        Effect.sync(() => {
          hybridSearchCalls.push(query)
          return []
        }),
    })
    const outbox = createRecordingOutbox()

    const first = makeScore("a")
    // The same broken tool, worded differently: the ids and counts a message
    // quotes are exactly what an embedding is sensitive to.
    const second = makeScore("b", { feedback: 'Tool "fetch_user" returned error: upstream 503 after 4 tries' })
    scores.set(first.id, first)
    scores.set(second.id, second)

    const firstResult = await runDiscovery({
      scoreId: first.id,
      feedback: first.feedback,
      embeddingSeed: 0,
      bundleKey: BUNDLE_KEY,
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })
    const secondResult = await runDiscovery({
      scoreId: second.id,
      feedback: second.feedback,
      embeddingSeed: 1024,
      bundleKey: BUNDLE_KEY,
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })

    expect(firstResult).toMatchObject({ action: "created" })
    expect(secondResult).toMatchObject({ action: "assigned" })
    expect(issues.size).toBe(1)
    expect([...issues.values()][0]?.bundleKey).toBe(BUNDLE_KEY)
    // The first occurrence of an unseen bucket still consults search once, so it can
    // adopt an issue that predates bundling. Once the key is claimed the second
    // occurrence resolves exactly, which is the case that repeats all day.
    expect(hybridSearchCalls).toEqual([first.feedback, first.feedback])
  })

  it("keeps two failure classes apart", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const outbox = createRecordingOutbox()

    const timeout = makeScore("a", {
      metadata: {
        rawFeedback: "x",
        flaggerSlug: "tool-call-errors",
        flaggerBundleKey: "tool-call-errors:error:fetch_user:http-503",
      },
    })
    const notFound = makeScore("b", {
      metadata: {
        rawFeedback: "x",
        flaggerSlug: "tool-call-errors",
        flaggerBundleKey: "tool-call-errors:error:fetch_user:http-404",
      },
    })
    scores.set(timeout.id, timeout)
    scores.set(notFound.id, notFound)

    await runDiscovery({
      scoreId: timeout.id,
      feedback: timeout.feedback,
      embeddingSeed: 0,
      bundleKey: "tool-call-errors:error:fetch_user:http-503",
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })
    await runDiscovery({
      scoreId: notFound.id,
      feedback: notFound.feedback,
      embeddingSeed: 0,
      bundleKey: "tool-call-errors:error:fetch_user:http-404",
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })

    // The second bucket fuzzy-matches the first issue, but that issue already owns
    // a key, so the claim fails and the class keeps its own issue.
    expect(issues.size).toBe(2)
    expect([...issues.values()].map((issue) => issue.bundleKey).sort()).toEqual([
      "tool-call-errors:error:fetch_user:http-404",
      "tool-call-errors:error:fetch_user:http-503",
    ])
  })

  it("still clusters by meaning when the score carries no bucket", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const hybridSearchCalls: string[] = []
    const { repository: signalRepository } = createFakeSignalRepository([], {
      hybridSearch: ({ query }) =>
        Effect.sync(() => {
          hybridSearchCalls.push(query)
          return []
        }),
    })
    const outbox = createRecordingOutbox()

    const score = makeScore("a", {
      sourceId: "UI",
      metadata: { rawFeedback: "The assistant was rude." },
      feedback: "The assistant was rude.",
    })
    scores.set(score.id, score)

    await runDiscovery({
      scoreId: score.id,
      feedback: score.feedback,
      embeddingSeed: 0,
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })

    // Twice: the fuzzy path re-runs retrieval under the project lock before it is
    // allowed to create. Bundled scores skip both.
    expect(hybridSearchCalls).toEqual(["The assistant was rude.", "The assistant was rude."])
  })

  it("adopts the bucket onto an issue that predates bundling instead of duplicating it", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const legacy: Signal = {
      id: SignalId("llllllllllllllllllllllll"),
      organizationId,
      projectId,
      slug: "tool-failure",
      name: "Tool failure",
      description: "fetch_user keeps failing",
      source: "flagger",
      origin: "system",
      scoreEvidence: [],
      assigneeId: null,
      priority: null,
      bundleKey: null,
      centroid: null,
      clusteredAt: null,
      promotedAt: new Date("2026-03-01T00:00:00.000Z"),
      resolvedAt: null,
      ignoredAt: null,
      regressedAt: null,
      mutedAt: null,
      feedback: null,
      deletedAt: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    }
    const { repository: signalRepository, issues } = createFakeSignalRepository([legacy], {
      hybridSearch: () =>
        Effect.succeed([{ signalId: legacy.id, name: legacy.name, description: legacy.description, score: 1 }]),
    })
    const outbox = createRecordingOutbox()

    const first = makeScore("a")
    const second = makeScore("b")
    scores.set(first.id, first)
    scores.set(second.id, second)

    const firstResult = await runDiscovery({
      scoreId: first.id,
      feedback: first.feedback,
      embeddingSeed: 0,
      bundleKey: BUNDLE_KEY,
      scoreRepository,
      signalRepository,
      outbox: outbox.service,
    })

    expect(firstResult).toMatchObject({ action: "assigned", signalId: legacy.id })
    expect(issues.size).toBe(1)
    expect(issues.get(legacy.id)?.bundleKey).toBe(BUNDLE_KEY)

    // Now keyed, so the second occurrence resolves exactly and never consults search.
    const searched: string[] = []
    const { repository: keyedRepository } = createFakeSignalRepository([...issues.values()], {
      hybridSearch: ({ query }) =>
        Effect.sync(() => {
          searched.push(query)
          return []
        }),
    })

    const secondResult = await runDiscovery({
      scoreId: second.id,
      feedback: second.feedback,
      embeddingSeed: 1024,
      bundleKey: BUNDLE_KEY,
      scoreRepository,
      signalRepository: keyedRepository,
      outbox: outbox.service,
    })

    expect(secondResult).toMatchObject({ action: "assigned", signalId: legacy.id })
    expect(searched).toEqual([])
  })

  it("keeps the bundle key within the column's bound", () => {
    expect(BUNDLE_KEY.length).toBeLessThanOrEqual(SIGNAL_BUNDLE_KEY_MAX_LENGTH)
  })
})
