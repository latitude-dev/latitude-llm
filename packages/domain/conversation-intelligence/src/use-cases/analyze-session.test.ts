import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  ChSqlClient,
  DistributedLockRepository,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SpanId,
  SqlClient,
  TaxonomyClusterId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { type SessionDetail, SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import {
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  type TaxonomyClusterRepositoryShape,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  type TaxonomyObservationRepositoryShape,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import { SessionMomentLabelRepository } from "../ports/session-moment-label-repository.ts"
import { SessionSemanticMomentRepository } from "../ports/session-semantic-moment-repository.ts"
import {
  createFakeSessionAnalysisRepository,
  createFakeSessionMomentLabelRepository,
  createFakeSessionSemanticMomentRepository,
} from "../testing/index.ts"
import { analyzeSessionUseCase } from "./analyze-session.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const traceId = TraceId("t".repeat(32))
const now = new Date("2026-05-24T12:00:00.000Z")

const message = (role: "user" | "assistant", content: string) => ({ role, parts: [{ type: "text", content }] })

const makeSession = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  organizationId,
  projectId,
  sessionId,
  traceCount: 1,
  traceIds: [traceId],
  spanCount: 1,
  errorCount: 0,
  startTime: now,
  endTime: new Date(now.getTime() + 1000),
  lastActivityTime: now,
  durationNs: 1_000_000,
  timeToFirstTokenNs: 100_000,
  tokensInput: 10,
  tokensOutput: 20,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 30,
  costInputMicrocents: 1,
  costOutputMicrocents: 2,
  costTotalMicrocents: 3,
  userId: ExternalUserId("user-1"),
  simulationId: "",
  tags: [],
  metadata: {},
  models: ["gpt"],
  providers: ["openai"],
  serviceNames: ["chat-api"],
  rootSpanId: SpanId("s".repeat(16)),
  rootSpanName: "chat",
  systemInstructions: { role: "system", parts: [] } as never,
  inputMessages: [message("user", "I need help with my roaming data plan")],
  lastInputMessages: [message("user", "I need help with my roaming data plan")],
  outputMessages: [message("assistant", "I can help troubleshoot roaming data settings")],
  ...overrides,
})

const createFakeTaxonomyClusterRepository = (seed: readonly TaxonomyCluster[] = []) => {
  const clusters = new Map(seed.map((cluster) => [cluster.id, cluster] as const))
  const repository: Partial<TaxonomyClusterRepositoryShape> = {
    findById: (id) =>
      Effect.gen(function* () {
        const cluster = clusters.get(id)
        if (!cluster) return yield* new NotFoundError({ entity: "TaxonomyCluster", id })
        return cluster
      }),
    listNearestActive: ({ projectId, parentClusterId }) =>
      Effect.succeed(
        [...clusters.values()]
          .filter(
            (cluster) =>
              cluster.projectId === projectId &&
              cluster.state === "active" &&
              (parentClusterId === undefined || cluster.parentClusterId === parentClusterId),
          )
          .map((cluster) => ({ cluster, cosine: 1 })),
      ),
    save: (cluster) =>
      Effect.sync(() => {
        clusters.set(cluster.id, cluster)
      }),
  }
  return { repository: repository as TaxonomyClusterRepositoryShape, clusters }
}

const createFakeTaxonomyObservationRepository = (seed: readonly TaxonomyMomentObservation[] = []) => {
  const rows: TaxonomyMomentObservation[] = [...seed]
  const repository: Partial<TaxonomyObservationRepositoryShape> = {
    upsertMany: (observations) =>
      Effect.sync(() => {
        rows.push(...observations)
      }),
    filterExistingIds: ({ observationIds }) =>
      Effect.succeed(observationIds.filter((observationId) => rows.some((row) => row.observationId === observationId))),
    listBySession: ({ organizationId, projectId, sessionId, analysisHash }) =>
      Effect.sync(() => {
        const latestById = new Map<string, TaxonomyMomentObservation>()
        for (const row of rows) {
          if (row.organizationId !== organizationId || row.projectId !== projectId || row.sessionId !== sessionId) {
            continue
          }
          if (analysisHash && row.analysisHash !== analysisHash) continue
          latestById.set(row.observationId, row)
        }
        return [...latestById.values()]
      }),
    getCounts: () => Effect.die("taxonomy ingestion must not check sample capacity"),
  }
  return { repository: repository as TaxonomyObservationRepositoryShape, rows }
}

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: TaxonomyClusterId("c".repeat(24)),
  organizationId,
  projectId,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Roaming support",
  description: "Users need help with roaming.",
  centroid: { base: [1, 0], mass: 1, model: "test", decay: 1, weights: { default: 1 } },
  observationCount: 0,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const makeSessionWithMessages = (messages: readonly ReturnType<typeof message>[]) =>
  makeSession({
    inputMessages: messages.slice(0, 1),
    lastInputMessages: messages.slice(0, 1),
    outputMessages: messages.slice(1),
  })

const runUseCase = (input: {
  readonly session: SessionDetail
  readonly ai?: AIShape
  readonly seedAnalyses?: readonly import("../entities/session-analysis.ts").SessionAnalysis[]
  readonly seedClusters?: readonly TaxonomyCluster[]
  readonly seedTaxonomyObservations?: readonly TaxonomyMomentObservation[]
}) => {
  const analyses = createFakeSessionAnalysisRepository(input.seedAnalyses ?? [])
  const semanticMoments = createFakeSessionSemanticMomentRepository()
  const momentLabels = createFakeSessionMomentLabelRepository()
  const taxonomyObservations = createFakeTaxonomyObservationRepository(input.seedTaxonomyObservations)
  const taxonomyClusters = createFakeTaxonomyClusterRepository(input.seedClusters)
  const taxonomyLocks = createFakeDistributedLockRepository()
  const sessions = createFakeSessionRepository({ findBySessionId: () => Effect.succeed(input.session) })
  const ai: AIShape =
    input.ai ??
    ({
      generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
      embed: () => Effect.succeed({ embedding: [1, 0] }),
      rerank: () => Effect.die("rerank not used"),
    } satisfies AIShape)

  const effect = analyzeSessionUseCase({
    organizationId,
    projectId,
    sessionId,
    triggeringTraceId: traceId,
    triggeringStartTime: now.toISOString(),
  }).pipe(
    Effect.provide(Layer.succeed(SessionRepository, sessions.repository)),
    Effect.provide(Layer.succeed(SessionAnalysisRepository, analyses.repository)),
    Effect.provide(Layer.succeed(SessionSemanticMomentRepository, semanticMoments.repository)),
    Effect.provide(Layer.succeed(SessionMomentLabelRepository, momentLabels.repository)),
    Effect.provide(Layer.succeed(TaxonomyObservationRepository, taxonomyObservations.repository)),
    Effect.provide(Layer.succeed(TaxonomyClusterRepository, taxonomyClusters.repository)),
    Effect.provide(Layer.succeed(DistributedLockRepository, taxonomyLocks.repository)),
    Effect.provide(Layer.succeed(AI, ai)),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
  )

  return { effect, analyses, semanticMoments, momentLabels, taxonomyObservations, taxonomyClusters }
}

describe("analyzeSessionUseCase", () => {
  it("analyzes user conversations and persists generated analysis", async () => {
    const { effect, analyses, semanticMoments, taxonomyObservations } = runUseCase({
      session: makeSession(),
    })

    const result = await Effect.runPromise(effect)
    const analysis = [...analyses.rows.values()][0]

    expect(result).toEqual({ action: "recorded", status: "analyzed", momentCount: 0 })
    expect(analysis?.analysisStatus).toBe("analyzed")
    expect(semanticMoments.rows).toHaveLength(1)
    expect(taxonomyObservations.rows).toHaveLength(1)
    expect((taxonomyObservations.rows[0] as TaxonomyMomentObservation | undefined)?.retentionDays).toBe(
      TAXONOMY_OBSERVATION_RETENTION_DAYS,
    )
  })

  it("persists deterministic taxonomy observation summaries", async () => {
    const { effect, taxonomyObservations } = runUseCase({
      session: makeSessionWithMessages([
        message("user", "Please check roaming for my account"),
        message("assistant", "I checked the account and reset the roaming profile"),
      ]),
      ai: {
        generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
        embed: (input) => {
          if (input.text.startsWith("user:")) return Effect.succeed({ embedding: [1, 0] })
          if (input.text.startsWith("assistant:")) return Effect.succeed({ embedding: [0, 1] })
          return Effect.succeed({ embedding: [-1, 0] })
        },
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await Effect.runPromise(effect)

    const [observation] = taxonomyObservations.rows as TaxonomyMomentObservation[]
    const topicSummary = observation?.projectionMetadata.summary

    expect(observation?.projectionMethod).toBe(TaxonomyProjectionMethod.MomentTextEmbedding)
    expect(observation?.projectionMetadata.projectionKind).toBe("session_conversation")
    expect(observation?.embedding).toEqual([1, 0])
    expect(topicSummary).toEqual(
      "user: Please check roaming for my account\n\nassistant: I checked the account and reset the roaming profile",
    )
  })

  it("uses the full conversation for taxonomy naming summaries", async () => {
    const { effect, taxonomyObservations } = runUseCase({
      session: makeSessionWithMessages([
        message("user", "Hola, necesito cambiar la chaqueta de mi pedido reciente por una talla más grande."),
        message("assistant", "Puedo ayudarte con eso. ¿Qué talla quieres?"),
        message("user", "Por favor cámbiala por una chaqueta polar roja grande."),
      ]),
    })

    await Effect.runPromise(effect)

    const [observation] = taxonomyObservations.rows as TaxonomyMomentObservation[]
    const topicSummary = String(observation?.projectionMetadata.summary)

    expect(topicSummary).toContain("cambiar la chaqueta")
    expect(topicSummary).toContain("Puedo ayudarte")
    expect(topicSummary).toContain("chaqueta polar roja grande")
  })

  it("does not truncate long taxonomy projections to the opening verification flow", async () => {
    const repeatedVerification =
      "assistant: To continue, I need to verify your identity with email, name, and ZIP.\n\n".repeat(30)
    const midSessionOrderTopic = "user: I need to return the air purifier and cancel the garden hose order."
    const closingResolution = "assistant: The return and cancellation were processed with a refund to PayPal."
    const longSession = [repeatedVerification, midSessionOrderTopic, closingResolution].join("\n\n")
    const embeddedTexts: string[] = []
    const { effect, taxonomyObservations } = runUseCase({
      session: makeSessionWithMessages([message("user", longSession), message("assistant", "Done")]),
      ai: {
        generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
        embed: (input) => {
          embeddedTexts.push(input.text)
          return Effect.succeed({ embedding: [1, 0] })
        },
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await Effect.runPromise(effect)

    const [observation] = taxonomyObservations.rows as TaxonomyMomentObservation[]
    const taxonomyEmbeddingText = embeddedTexts.at(-1) ?? ""
    const topicSummary = String(observation?.projectionMetadata.summary)

    expect(taxonomyEmbeddingText).toContain(midSessionOrderTopic)
    expect(topicSummary).toContain(midSessionOrderTopic)
  })

  it("applies centroid updates when a same-session observation changes from noise to assigned", async () => {
    const first = runUseCase({ session: makeSession() })
    await Effect.runPromise(first.effect)
    const previous = first.taxonomyObservations.rows[0]
    expect(previous?.assignmentMethod).toBe("noise")

    const cluster = makeCluster()
    const second = runUseCase({
      session: makeSession(),
      seedClusters: [cluster],
      seedTaxonomyObservations: previous ? [previous] : [],
    })

    await Effect.runPromise(second.effect)

    const savedCluster = second.taxonomyClusters.clusters.get(cluster.id)
    const latestObservation = second.taxonomyObservations.rows.at(-1)
    expect(latestObservation?.observationId).toBe(previous?.observationId)
    expect(latestObservation?.assignedClusterId).toBe(cluster.id)
    expect(savedCluster?.observationCount).toBe(1)
  })

  it("replaces same-session taxonomy observations when the projection hash changes", async () => {
    const cluster = makeCluster()
    const first = runUseCase({ session: makeSession(), seedClusters: [cluster] })
    await Effect.runPromise(first.effect)
    const previous = first.taxonomyObservations.rows[0]
    const firstCluster = first.taxonomyClusters.clusters.get(cluster.id)
    expect(previous?.assignmentMethod).toBe("centroid_online")
    expect(firstCluster?.observationCount).toBe(1)

    const changedSession = makeSessionWithMessages([
      message("user", "I need help with roaming data and an international eSIM activation"),
      message("assistant", "I can help troubleshoot the roaming plan and eSIM activation settings"),
    ])
    const second = runUseCase({
      session: changedSession,
      seedClusters: firstCluster ? [firstCluster] : [cluster],
      seedTaxonomyObservations: previous ? [previous] : [],
    })

    await Effect.runPromise(second.effect)

    const savedCluster = second.taxonomyClusters.clusters.get(cluster.id)
    const latestObservation = second.taxonomyObservations.rows.at(-1)
    expect(latestObservation?.observationId).toBe(previous?.observationId)
    expect(latestObservation?.assignedClusterId).toBe(cluster.id)
    expect(latestObservation?.projectionHash).not.toBe(previous?.projectionHash)
    expect(savedCluster?.observationCount).toBe(1)
  })

  it("skips sessions without both user and assistant messages without calling AI", async () => {
    let generateCalls = 0
    const { effect, analyses } = runUseCase({
      session: makeSession({ outputMessages: [] }),
      ai: {
        generate: <T>() => {
          generateCalls++
          return Effect.succeed({ object: {} as T, tokens: 0, duration: 0 })
        },
        embed: () => Effect.die("embed not used"),
        rerank: () => Effect.die("rerank not used"),
      },
    })

    const result = await Effect.runPromise(effect)
    const analysis = [...analyses.rows.values()][0]

    expect(result).toEqual({ action: "recorded", status: "skipped_non_conversation", momentCount: 0 })
    expect(generateCalls).toBe(0)
    expect(analysis?.analysisStatus).toBe("skipped_non_conversation")
  })

  it("detects interpretive labels with embedding anchors", async () => {
    const { effect, momentLabels } = runUseCase({
      session: makeSessionWithMessages([
        message("user", "I need help with roaming data"),
        message("user", "Please let me speak to a person"),
        message("assistant", "I will connect you to a human agent"),
      ]),
      ai: {
        generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
        embed: (input) => {
          const text = input.text.toLowerCase()
          if (
            text.includes("human agent") ||
            text.includes("manager") ||
            text.includes("take over") ||
            text.includes("speak to a person")
          ) {
            return Effect.succeed({ embedding: [1, 0] })
          }
          return Effect.succeed({ embedding: [-1, 0] })
        },
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await Effect.runPromise(effect)

    expect(momentLabels.rows.map((moment) => moment.kind).sort()).toEqual(["escalation"])
    expect(momentLabels.rows.every((moment) => moment.evidence.length > 0 && moment.confidence >= 0.65)).toBe(true)
  })

  it("anchors user frustration labels to the rendered user message index", async () => {
    const frustratedUserMessage = "This is incredibly frustrating, you keep giving me the wrong answer."
    const renderedMessages = [
      { role: "system", parts: [{ type: "text", content: "You are a support assistant" }] },
      message("user", "Can you help me update my billing email?"),
      message("assistant", "Sure, open account settings and choose Profile."),
      message("user", frustratedUserMessage),
      message("assistant", "I'm sorry, I will correct that now."),
    ] as const
    const { effect, momentLabels } = runUseCase({
      session: makeSession({
        systemInstructions: [{ type: "text", content: "You are a support assistant" }] as never,
        inputMessages: [message("user", "Can you help me update my billing email?")],
        lastInputMessages: [renderedMessages[1], renderedMessages[2], renderedMessages[3]],
        outputMessages: [renderedMessages[4]],
      }),
      ai: {
        generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
        embed: (input) => {
          const text = input.text.toLowerCase()
          if (text.includes("frustrat") || text.includes("annoyance") || text.includes("anger")) {
            return Effect.succeed({ embedding: [1, 0] })
          }
          return Effect.succeed({ embedding: [-1, 0] })
        },
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await Effect.runPromise(effect)

    const frustration = momentLabels.rows.find((label) => label.kind === "user_frustration")
    expect(frustration).toBeDefined()
    expect(frustration?.actor).toBe("user")
    expect(frustration?.firstMessageIndex).toBe(3)
    expect(frustration?.lastMessageIndex).toBe(3)
    expect(renderedMessages[frustration?.lastMessageIndex ?? -1]?.role).toBe("user")
    expect(frustration?.evidence).toBe(frustratedUserMessage)
  })

  it("skips unchanged sessions by analysis hash", async () => {
    const first = runUseCase({ session: makeSession() })
    await Effect.runPromise(first.effect)
    const current = [...first.analyses.rows.values()][0]
    expect(current).toBeDefined()

    let generateCalls = 0
    const second = runUseCase({
      session: makeSession(),
      seedAnalyses: current ? [current] : [],
      ai: {
        generate: <T>() => {
          generateCalls++
          return Effect.succeed({ object: {} as T, tokens: 0, duration: 0 })
        },
        embed: () => Effect.die("embed not used"),
        rerank: () => Effect.die("rerank not used"),
      },
    })

    const result = await Effect.runPromise(second.effect)

    expect(result).toEqual({ action: "skipped", reason: "hash-current" })
    expect(generateCalls).toBe(0)
  })

  it("records a failed coverage row when the session is not found", async () => {
    const analyses = createFakeSessionAnalysisRepository()
    const semanticMoments = createFakeSessionSemanticMomentRepository()
    const momentLabels = createFakeSessionMomentLabelRepository()
    const taxonomyObservations = createFakeTaxonomyObservationRepository()
    const taxonomyClusters = createFakeTaxonomyClusterRepository()
    const taxonomyLocks = createFakeDistributedLockRepository()
    const sessions = createFakeSessionRepository()

    const result = await Effect.runPromise(
      analyzeSessionUseCase({
        organizationId,
        projectId,
        sessionId,
        triggeringTraceId: traceId,
        triggeringStartTime: now.toISOString(),
      }).pipe(
        Effect.provide(Layer.succeed(SessionRepository, sessions.repository)),
        Effect.provide(Layer.succeed(SessionAnalysisRepository, analyses.repository)),
        Effect.provide(Layer.succeed(SessionSemanticMomentRepository, semanticMoments.repository)),
        Effect.provide(Layer.succeed(SessionMomentLabelRepository, momentLabels.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, taxonomyObservations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, taxonomyClusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, taxonomyLocks.repository)),
        Effect.provide(
          Layer.succeed(AI, {
            generate: () => Effect.die("not used"),
            embed: () => Effect.die("not used"),
            rerank: () => Effect.die("not used"),
          }),
        ),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    const analysis = [...analyses.rows.values()][0]
    expect(result).toEqual({ action: "recorded", status: "failed", momentCount: 0 })
    expect(analysis?.analysisStatus).toBe("failed")
    expect(analysis?.statusReason).toBe("Session not found")
  })

  it("does not call generate during session analysis", async () => {
    let generateCalls = 0
    const { effect, analyses } = runUseCase({
      session: makeSession(),
      ai: {
        generate: <T>() => {
          generateCalls++
          return Effect.die("generate not used") as Effect.Effect<GenerateResult<T>, never>
        },
        embed: () => Effect.succeed({ embedding: [1, 0] }),
        rerank: () => Effect.die("rerank not used"),
      },
    })

    const result = await Effect.runPromise(effect)
    const analysis = [...analyses.rows.values()][0]

    expect(result).toEqual({ action: "recorded", status: "analyzed", momentCount: 0 })
    expect(analysis?.analysisStatus).toBe("analyzed")
    expect(generateCalls).toBe(0)
  })
})
