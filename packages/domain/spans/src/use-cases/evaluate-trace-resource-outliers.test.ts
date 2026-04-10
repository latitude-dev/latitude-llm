import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import type { TraceDetail } from "../entities/trace.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { evaluateTraceResourceOutliersUseCase } from "./evaluate-trace-resource-outliers.ts"

function makeTraceDetail(overrides?: Partial<TraceDetail>): TraceDetail {
  return {
    organizationId: OrganizationId("o".repeat(24)),
    projectId: ProjectId("p".repeat(24)),
    traceId: TraceId("t".repeat(32)),
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-08T00:00:00.000Z"),
    endTime: new Date("2026-01-08T00:00:01.000Z"),
    durationNs: 450,
    timeToFirstTokenNs: 90,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 250,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 500,
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
    allMessages: [],
    ...overrides,
  }
}

describe("evaluateTraceResourceOutliersUseCase", () => {
  it("derives the default 7-day queue baseline window and excludes the candidate trace", async () => {
    const getCohortBaselineByProjectId = vi.fn(() =>
      Effect.succeed({
        traceCount: 999,
        metrics: {
          durationNs: { sampleCount: 999, p50: 100, p90: 200, p95: 300, p99: null },
          costTotalMicrocents: { sampleCount: 999, p50: 100, p90: 200, p95: 300, p99: null },
          tokensTotal: { sampleCount: 999, p50: 50, p90: 100, p95: 150, p99: null },
          timeToFirstTokenNs: { sampleCount: 800, p50: 20, p90: 40, p95: 60, p99: null },
        },
      }),
    )

    const repository = {
      findByTraceId: vi.fn(() => Effect.succeed(makeTraceDetail())),
      getCohortBaselineByProjectId,
    }

    const result = await Effect.runPromise(
      evaluateTraceResourceOutliersUseCase({
        organizationId: OrganizationId("o".repeat(24)),
        projectId: ProjectId("p".repeat(24)),
        traceId: TraceId("t".repeat(32)),
      }).pipe(Effect.provideService(TraceRepository, repository as never)),
    )

    expect(getCohortBaselineByProjectId).toHaveBeenCalledWith({
      organizationId: OrganizationId("o".repeat(24)),
      projectId: ProjectId("p".repeat(24)),
      excludeTraceId: TraceId("t".repeat(32)),
      filters: {
        startTime: [
          { op: "gte", value: "2026-01-01T00:00:00.000Z" },
          { op: "lte", value: "2026-01-08T00:00:00.000Z" },
        ],
      },
    })
    expect(result.matched).toBe(true)
    expect(result.reasons.map((reason) => reason.key)).toContain("latency-and-cost-p95-plus")
  })

  it("normalizes empty and partial filter inputs through the shared cohort-window resolver", async () => {
    const getCohortBaselineByProjectId = vi.fn(() =>
      Effect.succeed({
        traceCount: 999,
        metrics: {
          durationNs: { sampleCount: 999, p50: 100, p90: 200, p95: 300, p99: null },
          costTotalMicrocents: { sampleCount: 999, p50: 100, p90: 200, p95: 300, p99: null },
          tokensTotal: { sampleCount: 999, p50: 50, p90: 100, p95: 150, p99: null },
          timeToFirstTokenNs: { sampleCount: 800, p50: 20, p90: 40, p95: 60, p99: null },
        },
      }),
    )

    const repository = {
      findByTraceId: vi.fn(() => Effect.succeed(makeTraceDetail())),
      getCohortBaselineByProjectId,
    }

    await Effect.runPromise(
      evaluateTraceResourceOutliersUseCase({
        organizationId: OrganizationId("o".repeat(24)),
        projectId: ProjectId("p".repeat(24)),
        traceId: TraceId("t".repeat(32)),
        filters: {},
      }).pipe(Effect.provideService(TraceRepository, repository as never)),
    )

    await Effect.runPromise(
      evaluateTraceResourceOutliersUseCase({
        organizationId: OrganizationId("o".repeat(24)),
        projectId: ProjectId("p".repeat(24)),
        traceId: TraceId("t".repeat(32)),
        filters: { startTime: [{ op: "gte", value: "2026-01-04T00:00:00.000Z" }] },
      }).pipe(Effect.provideService(TraceRepository, repository as never)),
    )

    expect(getCohortBaselineByProjectId).toHaveBeenNthCalledWith(1, {
      organizationId: OrganizationId("o".repeat(24)),
      projectId: ProjectId("p".repeat(24)),
      excludeTraceId: TraceId("t".repeat(32)),
      filters: {
        startTime: [
          { op: "gte", value: "2026-01-01T00:00:00.000Z" },
          { op: "lte", value: "2026-01-08T00:00:00.000Z" },
        ],
      },
    })
    expect(getCohortBaselineByProjectId).toHaveBeenNthCalledWith(2, {
      organizationId: OrganizationId("o".repeat(24)),
      projectId: ProjectId("p".repeat(24)),
      excludeTraceId: TraceId("t".repeat(32)),
      filters: {
        startTime: [
          { op: "gte", value: "2026-01-04T00:00:00.000Z" },
          { op: "lte", value: "2026-01-08T00:00:00.000Z" },
        ],
      },
    })
  })
})
