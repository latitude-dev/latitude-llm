import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { draftFlaggerAnnotationUseCase } from "./draft-flagger-annotation.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const TRACE_ID = "c".repeat(32)

const makeTraceDetail = (): TraceDetail => ({
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  traceId: TraceId(TRACE_ID),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1,
  timeToFirstTokenNs: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  sessionId: SessionId("session"),
  userId: ExternalUserId("user"),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [{ role: "user", parts: [{ type: "text", content: "hello" }] }],
})

describe("draftFlaggerAnnotationUseCase", () => {
  it("generates a scoreId, returns it in the output, and forwards it to the annotator's telemetry", async () => {
    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
    })
    const { calls, layer: aiLayer } = createFakeAI({
      generate: <T>() =>
        Effect.succeed({
          object: { feedback: "Draft feedback" } as T,
          tokens: 10,
          duration: 100,
        }),
    })

    const result = await Effect.runPromise(
      draftFlaggerAnnotationUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        flaggerSlug: "jailbreaking",
        traceId: TRACE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(TraceRepository, traceRepo),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(ORG_ID) })),
            aiLayer,
          ),
        ),
      ),
    )

    expect(result.scoreId).toBeTruthy()
    expect(typeof result.scoreId).toBe("string")
    expect(result.scoreId.length).toBeGreaterThan(0)
    expect(result.feedback).toBe("Draft feedback")
    expect(result.traceId).toBe(TRACE_ID)
    expect(result.sessionId).toBe("session")
    expect(result.simulationId).toBeNull()

    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0].telemetry).toMatchObject({
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerDraft],
      metadata: expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        flaggerSlug: "jailbreaking",
        scoreId: result.scoreId,
      }),
    })
  })
})
