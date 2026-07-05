import { AICredentialError } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ScriptCompileError, ScriptRuntimeError } from "@domain/sandbox"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import {
  ChSqlClient,
  ExternalUserId,
  type FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SpanId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import {
  MessageEmbeddingRepository,
  type Session,
  SessionRepository,
  SpanRepository,
  type TraceDetail,
  TraceRepository,
  TraceSearchRepository,
  type TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  createFakeMessageEmbeddingRepository,
  createFakeSessionRepository,
  createFakeSpanRepository,
  createFakeTraceRepository,
  createFakeTraceSearchRepository,
} from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SignalRepository } from "../ports/signal-repository.ts"
import type { GeneratedSignalDraft } from "../signal-generation-schema.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { createSignalFromPromptUseCase } from "./create-signal-from-prompt.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const traceId = TraceId("a".repeat(32))
const sessionId = SessionId("session-1")

const traceDetail: TraceDetail = {
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  traceId,
  spanCount: 2,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1_000_000_000,
  timeToFirstTokenNs: 0,
  tokensInput: 120,
  tokensOutput: 80,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 200,
  costInputMicrocents: 50,
  costOutputMicrocents: 25,
  costTotalMicrocents: 75,
  sessionId,
  userId: ExternalUserId("user"),
  userEmail: "",
  simulationId: "",
  tags: [],
  metadata: {},
  models: ["gpt-4o-mini"],
  providers: ["openai"],
  serviceNames: ["web"],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [
    { role: "user", parts: [{ type: "text", content: "cancel my ticket" }] },
    { role: "assistant", parts: [{ type: "text", content: "done" }] },
  ],
}

const histogramBucket: TraceTimeHistogramBucket = {
  bucketStart: "2026-01-01T00:00:00.000Z",
  traceCount: 1200,
  sessionCount: 1000,
  costTotalMicrocentsSum: 0,
  durationNsMedian: 0,
  tokensTotalSum: 0,
  spanCountSum: 0,
  timeToFirstTokenNsMedian: 0,
  tokensInputSum: 0,
  tokensCacheReadSum: 0,
  tokensCacheCreateSum: 0,
}

type GeneratedRuleCondition = NonNullable<GeneratedSignalDraft["ruleConditions"]>[number]

const condition = (partial: Partial<GeneratedRuleCondition> & Pick<GeneratedRuleCondition, "type">) =>
  ({
    scope: null,
    textOperator: null,
    text: null,
    caseSensitive: null,
    unit: null,
    comparison: null,
    numberValue: null,
    expectation: null,
    metricField: null,
    aggregation: null,
    toolName: null,
    threshold: null,
    ...partial,
  }) as GeneratedRuleCondition

const emptyFilters: GeneratedSignalDraft["filters"] = {
  tags: [],
  serviceNames: [],
  models: [],
  providers: [],
  metadata: [],
}

const baseDraft: GeneratedSignalDraft = {
  reasoning: "matches the observed cancel_ticket tool",
  confirm: false,
  name: "Cancellation tool failures",
  description: "Sessions where the cancel_ticket tool fails",
  evaluationKind: "rule",
  ruleMatch: "all",
  ruleConditions: [condition({ type: "tool_failed", toolName: "cancel_ticket" })],
  judgeCriteria: "",
  script: "",
  filters: emptyFilters,
  sampling: 100,
}

type GenerateTurn = GeneratedSignalDraft | { readonly fail: AICredentialError }

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const createFakeEvaluationRepository = () => {
  const evaluations = new Map<string, Evaluation>()
  const service = EvaluationRepository.of({
    findById: (id) =>
      Effect.sync(() => evaluations.get(id)).pipe(
        Effect.flatMap((e) => (e ? Effect.succeed(e) : Effect.die(`evaluation ${id} not found`))),
      ),
    save: (evaluation) => Effect.sync(() => void evaluations.set(evaluation.id, evaluation)),
    listByProjectId: () => Effect.succeed({ items: [...evaluations.values()], hasMore: false, limit: 100, offset: 0 }),
    listBySignalId: ({ signalId }) =>
      Effect.succeed({
        items: [...evaluations.values()].filter((e) => e.signalId === signalId),
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    softDelete: () => Effect.void,
    softDeleteBySignalId: () => Effect.void,
  })
  return { evaluations, service }
}

const buildLayer = (options: {
  readonly turns: readonly GenerateTurn[]
  readonly hasSessions?: boolean
  readonly compileFailures?: number
  readonly runFailures?: number
}) => {
  const queue = [...options.turns]
  const fakeAI = createFakeAI({
    generate: <T>() => {
      const turn = queue.shift()
      if (turn === undefined) return Effect.die("unexpected generate call")
      if ("fail" in turn) return Effect.fail(turn.fail)
      return Effect.succeed({ object: turn as T, tokens: 10, duration: 5 })
    },
  })

  let compileCount = 0
  let runCount = 0
  const fakeRuntime = createFakeScriptRuntime({
    compile: ({ source }) => {
      compileCount += 1
      if (compileCount <= (options.compileFailures ?? 0)) {
        return Effect.fail(new ScriptCompileError({ message: "unexpected token" }))
      }
      return Effect.succeed({ source, contentHash: "hash", capabilities: [] })
    },
    run: () => {
      runCount += 1
      if (runCount <= (options.runFailures ?? 0)) {
        return Effect.fail(new ScriptRuntimeError({ message: `run boom ${runCount}` }))
      }
      return Effect.succeed({ value: 1, duration: 0, tokens: 0, cost: 0 })
    },
  })

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(traceDetail),
    distinctFilterValues: ({ column }) =>
      Effect.succeed(column === "tools" || column === "definedTools" ? ["cancel_ticket", "search_flights"] : ["web"]),
    histogramByProjectId: () => Effect.succeed([histogramBucket]),
  })

  const sessionListInputs: (FilterSet | undefined)[] = []
  const { repository: sessionRepository } = createFakeSessionRepository({
    findBySessionId: () => Effect.fail(new NotFoundError({ entity: "Session", id: String(sessionId) })),
    histogramByProjectId: () => Effect.succeed([histogramBucket]),
    listByProjectId: (input) => {
      sessionListInputs.push(input.options.filters)
      return Effect.succeed({
        items: options.hasSessions === false ? [] : [{ sessionId, traceIds: [traceId] } as unknown as Session],
        hasMore: false,
      })
    },
  })
  const { repository: spanRepository } = createFakeSpanRepository({
    listBySessionId: () => Effect.succeed([]),
    listToolSpansBySessionId: () => Effect.succeed([]),
  })

  const { repository: signalRepository, issues } = createFakeSignalRepository()
  const evaluationRepo = createFakeEvaluationRepository()
  const events: OutboxWriteEvent[] = []
  const outboxEventWriter = OutboxEventWriter.of({
    write: (event) => Effect.sync(() => void events.push(event)),
  })

  return {
    aiCalls: fakeAI.calls,
    runtimeCalls: fakeRuntime.calls,
    sessionListInputs,
    signals: issues,
    evaluations: evaluationRepo.evaluations,
    events,
    layer: Layer.mergeAll(
      fakeAI.layer,
      fakeRuntime.layer,
      Layer.succeed(TraceRepository, traceRepository),
      Layer.succeed(SessionRepository, sessionRepository),
      Layer.succeed(SpanRepository, spanRepository),
      Layer.succeed(MessageEmbeddingRepository, createFakeMessageEmbeddingRepository().repository),
      Layer.succeed(TraceSearchRepository, createFakeTraceSearchRepository().repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
      Layer.succeed(SignalRepository, signalRepository),
      Layer.succeed(EvaluationRepository, evaluationRepo.service),
      Layer.succeed(OutboxEventWriter, outboxEventWriter),
    ),
  }
}

const runUseCase = (
  input: { prompt: string; filters?: FilterSet; onStep?: (step: string) => Effect.Effect<void> },
  layer: ReturnType<typeof buildLayer>["layer"],
) =>
  Effect.runPromise(
    createSignalFromPromptUseCase({
      organizationId,
      projectId,
      prompt: input.prompt,
      ...(input.filters ? { filters: input.filters } : {}),
      ...(input.onStep ? { onStep: input.onStep } : {}),
    }).pipe(
      Effect.match({
        onSuccess: (result) => ({ ok: true as const, result }),
        onFailure: (error) => ({ ok: false as const, error }),
      }),
      Effect.provide(layer),
      Effect.provideService(SqlClient, createPassthroughSqlClient()),
    ),
  )

describe("createSignalFromPromptUseCase", () => {
  it("creates a rule signal after a confirmed review turn", async () => {
    const { layer, aiCalls, signals, evaluations } = buildLayer({
      turns: [baseDraft, { ...baseDraft, confirm: true }],
    })

    const outcome = await runUseCase({ prompt: "track failures of the ticket cancellation tool" }, layer)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const signal = signals.get(outcome.result.signalId)
    expect(signal?.origin).toBe("user")
    expect(signal?.name).toBe("Cancellation tool failures")
    expect(signal?.filters).toBeNull()
    const evaluation = evaluations.get(outcome.result.evaluationId)
    expect(evaluation?.settings).toMatchObject({ kind: "rule", match: "all" })
    expect(evaluation?.trigger.sampling).toBe(100)
    expect(aiCalls.generate).toHaveLength(2)
    expect(aiCalls.generate[0]?.prompt).toContain("cancel_ticket")
    expect(aiCalls.generate[1]?.prompt).toContain("review turn")
  })

  it("creates a judge signal and maps filters onto the builder's shape", async () => {
    const judgeDraft: GeneratedSignalDraft = {
      ...baseDraft,
      name: "Frustrated users",
      evaluationKind: "judge",
      ruleConditions: [],
      judgeCriteria: "A session matches when the user expresses frustration",
      filters: { ...emptyFilters, tags: ["urgent"], metadata: [{ key: "env", value: "prod" }] },
      sampling: 25,
    }
    const { layer, signals, evaluations, sessionListInputs } = buildLayer({
      turns: [judgeDraft, { ...judgeDraft, confirm: true }],
    })

    const outcome = await runUseCase({ prompt: "find frustrated users" }, layer)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const signal = signals.get(outcome.result.signalId)
    expect(signal?.filters).toEqual({
      tags: [{ op: "in", value: ["urgent"] }],
      "metadata.env": [{ op: "eq", value: "prod" }],
    })
    const evaluation = evaluations.get(outcome.result.evaluationId)
    expect(evaluation?.settings).toEqual({
      kind: "judge",
      criteria: "A session matches when the user expresses frustration",
    })
    expect(evaluation?.script).toContain("await llm(")
    expect(evaluation?.trigger.sampling).toBe(25)
    // The preview ran against the draft's mapped filters.
    expect(sessionListInputs.some((filters) => filters !== undefined && "tags" in filters)).toBe(true)
  })

  it("creates a raw-script signal and clamps out-of-range sampling", async () => {
    const scriptDraft: GeneratedSignalDraft = {
      ...baseDraft,
      evaluationKind: "script",
      ruleConditions: [],
      script: "return Passed(1, 'ok')",
      sampling: 250,
    }
    const { layer, evaluations } = buildLayer({ turns: [scriptDraft, { ...scriptDraft, confirm: true }] })

    const outcome = await runUseCase({ prompt: "custom check" }, layer)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const evaluation = evaluations.get(outcome.result.evaluationId)
    expect(evaluation?.settings ?? null).toBeNull()
    expect(evaluation?.script).toBe("return Passed(1, 'ok')")
    expect(evaluation?.trigger.sampling).toBe(100)
  })

  it("feeds mapping issues back as a repair turn", async () => {
    const invalidDraft: GeneratedSignalDraft = { ...baseDraft, ruleConditions: [] }
    const { layer, aiCalls } = buildLayer({
      turns: [invalidDraft, baseDraft, { ...baseDraft, confirm: true }],
    })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(true)
    expect(aiCalls.generate).toHaveLength(3)
    expect(aiCalls.generate[1]?.prompt).toContain("previous draft failed")
    expect(aiCalls.generate[1]?.prompt).toContain("ruleConditions")
  })

  it("feeds a compile error back as a repair turn", async () => {
    const { layer, aiCalls } = buildLayer({
      turns: [baseDraft, baseDraft, { ...baseDraft, confirm: true }],
      compileFailures: 1,
    })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(true)
    expect(aiCalls.generate).toHaveLength(3)
    expect(aiCalls.generate[1]?.prompt).toContain("does not compile")
    expect(aiCalls.generate[1]?.prompt).toContain("unexpected token")
  })

  it("feeds an all-rows-errored preview back as a repair turn", async () => {
    const { layer, aiCalls } = buildLayer({
      turns: [baseDraft, baseDraft, { ...baseDraft, confirm: true }],
      runFailures: 1,
    })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(true)
    expect(aiCalls.generate).toHaveLength(3)
    expect(aiCalls.generate[1]?.prompt).toContain("Every preview run errored")
  })

  it("accepts a review-turn revision and creates the revised draft", async () => {
    const revised: GeneratedSignalDraft = { ...baseDraft, name: "Cancellation failures (checkout)" }
    const { layer, aiCalls, signals } = buildLayer({ turns: [baseDraft, revised] })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(signals.get(outcome.result.signalId)?.name).toBe("Cancellation failures (checkout)")
    expect(aiCalls.generate).toHaveLength(2)
  })

  it("creates without preview or review when the project has no sessions", async () => {
    const { layer, aiCalls, runtimeCalls, signals } = buildLayer({ turns: [baseDraft], hasSessions: false })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(signals.get(outcome.result.signalId)?.name).toBe("Cancellation tool failures")
    expect(aiCalls.generate).toHaveLength(1)
    expect(runtimeCalls.run).toHaveLength(0)
  })

  it("fails with SignalGenerationError when no draft ever validates", async () => {
    const invalidDraft: GeneratedSignalDraft = { ...baseDraft, ruleConditions: [] }
    const { layer, aiCalls, signals } = buildLayer({
      turns: [invalidDraft, invalidDraft, invalidDraft, invalidDraft],
    })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error._tag).toBe("SignalGenerationError")
    expect((outcome.error as { attempts: number }).attempts).toBe(4)
    expect(aiCalls.generate).toHaveLength(4)
    expect(signals.size).toBe(0)
  })

  it("surfaces a credential error immediately", async () => {
    const { layer, aiCalls } = buildLayer({
      turns: [{ fail: new AICredentialError({ provider: "amazon-bedrock", message: "expired" }) }],
    })

    const outcome = await runUseCase({ prompt: "track cancellations" }, layer)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error._tag).toBe("AICredentialError")
    expect(aiCalls.generate).toHaveLength(1)
  })

  it("rejects an empty prompt before any generation", async () => {
    const { layer, aiCalls } = buildLayer({ turns: [] })

    const outcome = await runUseCase({ prompt: "   " }, layer)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error._tag).toBe("BadRequestError")
    expect(aiCalls.generate).toHaveLength(0)
  })

  it("reports progress steps in order", async () => {
    const steps: string[] = []
    const { layer } = buildLayer({ turns: [baseDraft, { ...baseDraft, confirm: true }] })

    const outcome = await runUseCase(
      { prompt: "track cancellations", onStep: (step) => Effect.sync(() => void steps.push(step)) },
      layer,
    )

    expect(outcome.ok).toBe(true)
    expect(steps).toEqual([
      "Looking at your project's data",
      "Drafting your signal",
      "Testing it against recent sessions",
      "Reviewing the test results",
      "Creating the signal",
    ])
  })
})
