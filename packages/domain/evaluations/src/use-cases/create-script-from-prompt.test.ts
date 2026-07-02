import type { AI } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type ScriptRuntime, ScriptRuntimeError } from "@domain/sandbox"
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
import { createScriptFromPromptUseCase } from "./create-script-from-prompt.ts"

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
    { role: "user", parts: [{ type: "text", content: "summarize the deploy" }] },
    { role: "assistant", parts: [{ type: "text", content: "migrations, rollback, dashboards" }] },
  ],
}

const GENERATED_SCRIPT = "return Passed(1, 'ok')"

const buildLayer = (options: { readonly runFailures: number; readonly hasTrace?: boolean }) => {
  const fakeAI = createFakeAI({
    generate: <T>() =>
      Effect.succeed({
        object: { reasoning: "detects the behavior", script: GENERATED_SCRIPT } as T,
        tokens: 10,
        duration: 5,
      }),
  })

  let runCount = 0
  const fakeRuntime = createFakeScriptRuntime({
    run: () => {
      runCount += 1
      if (runCount <= options.runFailures) {
        return Effect.fail(new ScriptRuntimeError({ message: `boom ${runCount}` }))
      }
      return Effect.succeed({ value: 1, duration: 0, tokens: 0, cost: 0 })
    },
  })

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(traceDetail),
  })

  const sessionListFilters: (FilterSet | undefined)[] = []
  const { repository: sessionRepository } = createFakeSessionRepository({
    findBySessionId: () => Effect.fail(new NotFoundError({ entity: "Session", id: String(sessionId) })),
    listByProjectId: (input) => {
      sessionListFilters.push(input.options.filters)
      return Effect.succeed({
        items: options.hasTrace === false ? [] : [{ sessionId, traceIds: [traceId] } as unknown as Session],
        hasMore: false,
      })
    },
  })
  const { repository: spanRepository } = createFakeSpanRepository({
    listBySessionId: () => Effect.succeed([]),
    listToolSpansBySessionId: () => Effect.succeed([]),
  })

  return {
    aiCalls: fakeAI.calls,
    runtimeCalls: fakeRuntime.calls,
    sessionListFilters,
    layer: Layer.mergeAll(
      fakeAI.layer,
      fakeRuntime.layer,
      Layer.succeed(TraceRepository, traceRepository),
      Layer.succeed(SessionRepository, sessionRepository),
      Layer.succeed(SpanRepository, spanRepository),
      Layer.succeed(MessageEmbeddingRepository, createFakeMessageEmbeddingRepository().repository),
      Layer.succeed(TraceSearchRepository, createFakeTraceSearchRepository().repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    ),
  }
}

type UseCaseServices =
  | AI
  | ScriptRuntime
  | TraceRepository
  | SessionRepository
  | SpanRepository
  | ChSqlClient
  | MessageEmbeddingRepository
  | TraceSearchRepository

const runUseCase = (input: { prompt: string; filters?: FilterSet }, layer: Layer.Layer<UseCaseServices>) =>
  Effect.runPromise(
    createScriptFromPromptUseCase({
      organizationId,
      projectId,
      prompt: input.prompt,
      ...(input.filters ? { filters: input.filters } : {}),
    }).pipe(
      Effect.match({
        onSuccess: (result) => ({ ok: true as const, result }),
        onFailure: (error) => ({ ok: false as const, error }),
      }),
      Effect.provide(layer),
    ),
  )

describe("createScriptFromPromptUseCase", () => {
  it("returns the script when it runs against the project session on the first attempt", async () => {
    const { aiCalls, runtimeCalls, layer } = buildLayer({ runFailures: 0 })

    const outcome = await runUseCase({ prompt: "Flag refusals to valid requests" }, layer)

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.result).toEqual({ script: GENERATED_SCRIPT, reasoning: "detects the behavior" })
    }
    expect(aiCalls.generate).toHaveLength(1)
    expect(runtimeCalls.run).toHaveLength(1)
  })

  it("feeds the sandbox error back and recovers on a later attempt", async () => {
    const { aiCalls, runtimeCalls, layer } = buildLayer({ runFailures: 2 })

    const outcome = await runUseCase({ prompt: "Flag refusals" }, layer)

    expect(outcome.ok).toBe(true)
    expect(aiCalls.generate).toHaveLength(3)
    expect(runtimeCalls.run).toHaveLength(3)
    expect(aiCalls.generate[0]?.prompt).not.toContain("Sandbox error")
    expect(aiCalls.generate[1]?.prompt).toContain("Sandbox error")
    expect(aiCalls.generate[1]?.prompt).toContain("boom 1")
  })

  it("aborts with EvaluationScriptGenerationError after all attempts fail", async () => {
    const { aiCalls, layer } = buildLayer({ runFailures: 99 })

    const outcome = await runUseCase({ prompt: "Flag refusals" }, layer)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error._tag).toBe("EvaluationScriptGenerationError")
      expect((outcome.error as { attempts: number }).attempts).toBe(3)
    }
    expect(aiCalls.generate).toHaveLength(3)
  })

  it("selects the smoke-test session from the provided scope", async () => {
    const { layer, sessionListFilters } = buildLayer({ runFailures: 0 })
    const filters = { services: ["checkout"] } as unknown as FilterSet

    const outcome = await runUseCase({ prompt: "Flag refusals", filters }, layer)

    expect(outcome.ok).toBe(true)
    expect(sessionListFilters[0]).toEqual(filters)
  })

  it("rejects an empty prompt", async () => {
    const { layer } = buildLayer({ runFailures: 0 })

    const outcome = await runUseCase({ prompt: "   " }, layer)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error._tag).toBe("BadRequestError")
    }
  })

  it("fails when the project has no session to validate against", async () => {
    const { aiCalls, layer } = buildLayer({ runFailures: 0, hasTrace: false })

    const outcome = await runUseCase({ prompt: "Flag refusals" }, layer)

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error._tag).toBe("BadRequestError")
    }
    expect(aiCalls.generate).toHaveLength(0)
  })
})
