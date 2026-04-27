import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  AnnotationQueueId,
  ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { draftSystemQueueAnnotationUseCase } from "./draft-system-queue-annotation.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const TRACE_ID = "c".repeat(32)
const QUEUE_ID = AnnotationQueueId("qqqqqqqqqqqqqqqqqqqqqqqq")

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

const makeSystemQueue = (): AnnotationQueue => ({
  id: QUEUE_ID,
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  system: true,
  name: "Jailbreaking",
  slug: "jailbreaking",
  description: "",
  instructions: "",
  settings: {},
  assignees: [],
  totalItems: 0,
  completedItems: 0,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

describe("draftSystemQueueAnnotationUseCase", () => {
  it("generates a scoreId, returns it in the output, and forwards it to the annotator's telemetry", async () => {
    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([makeSystemQueue()])
    const { calls, layer: aiLayer } = createFakeAI({
      generate: <T>() =>
        Effect.succeed({
          object: { feedback: "Draft feedback" } as T,
          tokens: 10,
          duration: 100,
        }),
    })

    const result = await Effect.runPromise(
      draftSystemQueueAnnotationUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueSlug: "jailbreaking",
        traceId: TRACE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(TraceRepository, traceRepo),
            Layer.succeed(AnnotationQueueRepository, queueRepo),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(ORG_ID) })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(ORG_ID) })),
            aiLayer,
          ),
        ),
      ),
    )

    // Output carries a non-empty scoreId alongside the annotator result.
    expect(result.scoreId).toBeTruthy()
    expect(typeof result.scoreId).toBe("string")
    expect(result.scoreId.length).toBeGreaterThan(0)
    expect(result.queueId).toBe(QUEUE_ID)
    expect(result.feedback).toBe("Draft feedback")

    // Identity: the same scoreId that's returned in the output MUST be the one
    // stamped on the LLM telemetry metadata (the whole point of generating it
    // upstream of the LLM call — see PRD: "Identity strategy").
    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0].telemetry).toMatchObject({
      tags: [...AI_GENERATE_TELEMETRY_TAGS.queueSystemDraft],
      metadata: expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        queueSlug: "jailbreaking",
        scoreId: result.scoreId,
      }),
    })
  })

  it("fails cleanly when the system queue does not exist in the project", async () => {
    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([])
    const { layer: aiLayer } = createFakeAI({
      generate: <T>() => Effect.succeed({ object: { feedback: "unreachable" } as T, tokens: 0, duration: 0 }),
    })

    const exit = await Effect.runPromiseExit(
      draftSystemQueueAnnotationUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueSlug: "not-provisioned",
        traceId: TRACE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(TraceRepository, traceRepo),
            Layer.succeed(AnnotationQueueRepository, queueRepo),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(ORG_ID) })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(ORG_ID) })),
            aiLayer,
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("BadRequestError")
      expect(JSON.stringify(exit.cause)).toContain("not-provisioned")
    }
  })
})
