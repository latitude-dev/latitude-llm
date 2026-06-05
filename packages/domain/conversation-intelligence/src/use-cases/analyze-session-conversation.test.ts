import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  ChSqlClient,
  DistributedLockRepository,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { type SessionDetail, SessionRepository, type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeSessionRepository, createFakeTraceRepository } from "@domain/spans/testing"
import {
  CalibrationProfileRepository,
  type CalibrationProfileRepositoryShape,
  TaxonomyClusterRepository,
  type TaxonomyClusterRepositoryShape,
  TaxonomyObservationRepository,
  type TaxonomyObservationRepositoryShape,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ConversationMomentLabelRepository } from "../ports/moment-label-repository.ts"
import { ConversationSemanticMomentRepository } from "../ports/semantic-moment-repository.ts"
import { ConversationSessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import {
  createFakeConversationMomentLabelRepository,
  createFakeConversationSemanticMomentRepository,
  createFakeConversationSessionAnalysisRepository,
} from "../testing/index.ts"
import { analyzeSessionConversationUseCase } from "./analyze-session-conversation.ts"

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

const createFakeTaxonomyClusterRepository = () => {
  const repository: Partial<TaxonomyClusterRepositoryShape> = {
    listNearestActive: () => Effect.succeed([]),
  }
  return { repository: repository as TaxonomyClusterRepositoryShape }
}

const fakeCalibrationProfileRepository: CalibrationProfileRepositoryShape = {
  findByProject: () => Effect.succeed(null),
  save: () => Effect.void,
}

const createFakeTaxonomyObservationRepository = () => {
  const rows: unknown[] = []
  const repository: Partial<TaxonomyObservationRepositoryShape> = {
    upsertMany: (observations) =>
      Effect.sync(() => {
        rows.push(...observations)
      }),
    filterExistingIds: () => Effect.succeed([]),
  }
  return { repository: repository as TaxonomyObservationRepositoryShape, rows }
}

const makeTrace = (messages = makeSession().lastInputMessages.concat(makeSession().outputMessages)): TraceDetail => ({
  ...makeSession(),
  traceId,
  sessionId,
  inputMessages: messages.slice(0, 1),
  outputMessages: messages.slice(1),
  allMessages: messages,
})

const runUseCase = (input: {
  readonly session: SessionDetail
  readonly trace?: TraceDetail
  readonly ai?: AIShape
  readonly seedAnalyses?: readonly import("../entities/session-analysis.ts").ConversationSessionAnalysis[]
}) => {
  const analyses = createFakeConversationSessionAnalysisRepository(input.seedAnalyses ?? [])
  const semanticMoments = createFakeConversationSemanticMomentRepository()
  const momentLabels = createFakeConversationMomentLabelRepository()
  const taxonomyObservations = createFakeTaxonomyObservationRepository()
  const taxonomyClusters = createFakeTaxonomyClusterRepository()
  const taxonomyLocks = createFakeDistributedLockRepository()
  const sessions = createFakeSessionRepository({ findBySessionId: () => Effect.succeed(input.session) })
  const traces = createFakeTraceRepository({ listByTraceIds: () => Effect.succeed(input.trace ? [input.trace] : []) })
  const ai: AIShape =
    input.ai ??
    ({
      generate: <T>() => Effect.die(`generate not used`) as Effect.Effect<GenerateResult<T>, never>,
      embed: () => Effect.succeed({ embedding: [1, 0] }),
      rerank: () => Effect.die("rerank not used"),
    } satisfies AIShape)

  const effect = analyzeSessionConversationUseCase({
    organizationId,
    projectId,
    sessionId,
    triggeringTraceId: traceId,
    triggeringStartTime: now.toISOString(),
  }).pipe(
    Effect.provide(Layer.succeed(SessionRepository, sessions.repository)),
    Effect.provide(Layer.succeed(TraceRepository, traces.repository)),
    Effect.provide(Layer.succeed(ConversationSessionAnalysisRepository, analyses.repository)),
    Effect.provide(Layer.succeed(ConversationSemanticMomentRepository, semanticMoments.repository)),
    Effect.provide(Layer.succeed(ConversationMomentLabelRepository, momentLabels.repository)),
    Effect.provide(Layer.succeed(TaxonomyObservationRepository, taxonomyObservations.repository)),
    Effect.provide(Layer.succeed(TaxonomyClusterRepository, taxonomyClusters.repository)),
    Effect.provide(Layer.succeed(CalibrationProfileRepository, fakeCalibrationProfileRepository)),
    Effect.provide(Layer.succeed(DistributedLockRepository, taxonomyLocks.repository)),
    Effect.provide(Layer.succeed(AI, ai)),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
  )

  return { effect, analyses, semanticMoments, momentLabels, taxonomyObservations }
}

describe("analyzeSessionConversationUseCase", () => {
  it("analyzes user conversations and persists generated analysis", async () => {
    const { effect, analyses, semanticMoments, taxonomyObservations } = runUseCase({
      session: makeSession(),
      trace: makeTrace(),
    })

    const result = await Effect.runPromise(effect)
    const analysis = [...analyses.rows.values()][0]

    expect(result).toEqual({ action: "recorded", status: "analyzed", momentCount: 0 })
    expect(analysis?.interactionKind).toBe("user_conversation")
    expect(analysis?.analysisLens).toBe("conversation")
    expect(analysis?.analysisStatus).toBe("analyzed")
    expect(semanticMoments.rows).toHaveLength(1)
    expect(taxonomyObservations.rows.map((row) => (row as { dimension: string }).dimension)).toEqual(["topic"])
  })

  it("persists deterministic taxonomy observation summaries", async () => {
    const { effect, taxonomyObservations } = runUseCase({
      session: makeSession(),
      trace: makeTrace([
        message("user", "Please check roaming for my account"),
        message("assistant", "I checked the account and reset the roaming profile"),
      ]),
    })

    await Effect.runPromise(effect)

    const metadataByDimension = new Map(
      taxonomyObservations.rows.map((row) => {
        const typed = row as { readonly dimension: string; readonly projectionMetadata: Record<string, unknown> }
        return [typed.dimension, typed.projectionMetadata] as const
      }),
    )
    const topicSummary = metadataByDimension.get("topic")?.summary

    expect(topicSummary).toEqual(
      "user: Please check roaming for my account\n\nassistant: I checked the account and reset the roaming profile",
    )
  })

  it("skips sessions without both user and assistant messages without calling AI", async () => {
    let generateCalls = 0
    const { effect, analyses } = runUseCase({
      session: makeSession({ outputMessages: [] }),
      trace: makeTrace([message("user", "I need help with my roaming data plan")]),
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
    expect(analysis?.interactionKind).toBe("unknown")
  })

  it("detects interpretive labels with embedding anchors", async () => {
    const { effect, momentLabels } = runUseCase({
      session: makeSession(),
      trace: makeTrace([
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

  it("skips unchanged sessions by analysis hash", async () => {
    const first = runUseCase({ session: makeSession(), trace: makeTrace() })
    await Effect.runPromise(first.effect)
    const current = [...first.analyses.rows.values()][0]
    expect(current).toBeDefined()

    let generateCalls = 0
    const second = runUseCase({
      session: makeSession(),
      trace: makeTrace(),
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
    const analyses = createFakeConversationSessionAnalysisRepository()
    const semanticMoments = createFakeConversationSemanticMomentRepository()
    const momentLabels = createFakeConversationMomentLabelRepository()
    const taxonomyObservations = createFakeTaxonomyObservationRepository()
    const taxonomyClusters = createFakeTaxonomyClusterRepository()
    const taxonomyLocks = createFakeDistributedLockRepository()
    const sessions = createFakeSessionRepository()
    const traces = createFakeTraceRepository()

    const result = await Effect.runPromise(
      analyzeSessionConversationUseCase({
        organizationId,
        projectId,
        sessionId,
        triggeringTraceId: traceId,
        triggeringStartTime: now.toISOString(),
      }).pipe(
        Effect.provide(Layer.succeed(SessionRepository, sessions.repository)),
        Effect.provide(Layer.succeed(TraceRepository, traces.repository)),
        Effect.provide(Layer.succeed(ConversationSessionAnalysisRepository, analyses.repository)),
        Effect.provide(Layer.succeed(ConversationSemanticMomentRepository, semanticMoments.repository)),
        Effect.provide(Layer.succeed(ConversationMomentLabelRepository, momentLabels.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, taxonomyObservations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, taxonomyClusters.repository)),
        Effect.provide(Layer.succeed(CalibrationProfileRepository, fakeCalibrationProfileRepository)),
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
      trace: makeTrace(),
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
