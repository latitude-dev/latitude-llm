import { ChSqlClient, OrganizationId, ProjectId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { runCostSpeedShadow, type ShadowResourceSample } from "./run-cost-speed-shadow.ts"

const catalog = PROVISIONAL_COST_METRIC_CATALOG

const curve: CostMetricCurve = {
  curveId: "shadow.curve",
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: 0.1, penalty: 0 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: 0.1,
  watchMaxRawValue: 0.5,
}

const familyRecord = <Value>(value: Value): Record<CostFamily, Value> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, value])) as Record<CostFamily, Value>

const artifact: CostScoringArtifact = {
  artifactVersion: "cost-artifact-shadow-test",
  calibration: "provisional",
  familyWeights: { spend: 0.2, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
  metricCurves: catalog.entries.map((entry) => ({ ...curve, curveId: entry.curveId })),
  metricCaps: Object.fromEntries(catalog.entries.map((entry) => [entry.metricId, 1])),
  familyCaps: familyRecord(1),
  familyCoverageRequirements: familyRecord({ required: false, coverageFloor: 0.5 }),
  overlapPolicies: [],
  residualSignalCap: 0.1,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.1 },
}

const latencyArtifact: LatencyReferenceArtifact = {
  artifactVersion: "latency-artifact-shadow-test",
  calibration: "provisional",
  minimumSampleCount: 1,
  minimumOrganizationCount: 1,
  ttft: [],
  throughput: [],
}

const makeSession = (index: number): SessionDetail =>
  ({
    organizationId: OrganizationId("org-1"),
    projectId: ProjectId("project-1"),
    sessionId: SessionId(`session-${index}`),
    traceIds: [TraceId(`trace-${index}`)],
    systemInstructions: [],
    inputMessages: [],
    lastInputMessages: [],
    outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "Done" }] }],
    tags: [],
    definedTools: [],
    tokensInput: 100,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 500,
    durationNs: 1_000_000,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  }) as unknown as SessionDetail

const runShadow = ({
  sessionCount,
  batchSize,
  samples,
}: {
  readonly sessionCount: number
  readonly batchSize: number
  readonly samples?: readonly ShadowResourceSample[]
}) => {
  const sessions = Array.from({ length: sessionCount }, (_, index) => makeSession(index + 1))
  const batchSizes: number[] = []
  let sampleIndex = 0
  const telemetryLayer = Layer.succeed(SessionAssessmentBulkTelemetrySource, {
    read: (input) => {
      batchSizes.push(input.sessionIds.length)
      return Effect.succeed(
        sessions
          .filter((session) => input.sessionIds.includes(session.sessionId))
          .map((session) => ({
            session,
            spans: [],
            generations: [],
            toolCalls: [],
            memoryEvents: [],
            moments: { moments: [], labels: [] },
            screeningDecisions: [],
          })),
      )
    },
  })
  const judgmentLayer = Layer.succeed(SessionAssessmentBulkJudgmentSource, {
    read: (input) => Effect.succeed(input.sessions.map(({ sessionId }) => ({ sessionId, scores: [], signals: [] }))),
  })

  return Effect.runPromise(
    runCostSpeedShadow({
      organizationId: OrganizationId("org-1"),
      projectId: ProjectId("project-1"),
      sessionIds: sessions.map(({ sessionId }) => sessionId),
      cutoff: new Date("2026-01-02T00:00:00.000Z"),
      artifact,
      latencyArtifact,
      catalog,
      batchSize,
      bootstrapReplicates: 40,
      bootstrapSeed: 7,
      ...(samples ? { probe: { sample: () => samples[sampleIndex++] ?? {} } } : {}),
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          telemetryLayer,
          judgmentLayer,
          Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId("org-1") })),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("org-1") })),
        ),
      ),
    ),
  ).then((report) => ({ report, batchSizes }))
}

const withoutTimings = (report: Awaited<ReturnType<typeof runShadow>>["report"]) => {
  const { resources, ...rest } = report
  const { resolverMs: _resolverMs, slowestBatchMs: _slowestBatchMs, ...countedResources } = resources
  return { ...rest, resources: countedResources }
}

describe("runCostSpeedShadow", () => {
  it("reads the window in bounded batches instead of all at once", async () => {
    const { report, batchSizes } = await runShadow({ sessionCount: 7, batchSize: 3 })

    expect(batchSizes).toEqual([3, 3, 1])
    expect(report.batchCount).toBe(3)
    expect(report.requestedSessionCount).toBe(7)
    expect(report.readSessionCount).toBe(7)
  })

  it("rejects an invalid batch size before reading the window", async () => {
    for (const batchSize of [0, -1, 1.5]) {
      await expect(runShadow({ sessionCount: 1, batchSize })).rejects.toThrow("batchSize must be a positive integer")
    }
  })

  it("reports a window score without producing a snapshot or a per-session score", async () => {
    const { report } = await runShadow({ sessionCount: 5, batchSize: 5 })

    expect(report.artifactVersion).toBe("cost-artifact-shadow-test")
    expect(report.catalogVersion).toBe(catalog.catalogVersion)
    expect(report.cost.cost).toBeGreaterThanOrEqual(0)
    expect(report.cost.cost).toBeLessThanOrEqual(100)
    expect(report.speed.speed).toBeGreaterThanOrEqual(0)
    expect(report.interval.cost.lower).toBeLessThanOrEqual(report.interval.cost.point)
    expect(report.interval.cost.upper).toBeGreaterThanOrEqual(report.interval.cost.point)
    expect(report).not.toHaveProperty("snapshot")
  })

  it("reproduces the same report on a rerun over the same window, apart from its timings", async () => {
    const first = await runShadow({ sessionCount: 6, batchSize: 2 })
    const second = await runShadow({ sessionCount: 6, batchSize: 2 })

    expect(withoutTimings(second.report)).toEqual(withoutTimings(first.report))
  })

  it("does not change the window score when the batch size changes", async () => {
    const oneBatch = await runShadow({ sessionCount: 6, batchSize: 6 })
    const threeBatches = await runShadow({ sessionCount: 6, batchSize: 2 })

    expect(threeBatches.report.cost).toEqual(oneBatch.report.cost)
    expect(threeBatches.report.speed).toEqual(oneBatch.report.speed)
    expect(threeBatches.report.fold.contributions).toEqual(oneBatch.report.fold.contributions)
  })

  it("reads nothing for an empty window", async () => {
    const { report, batchSizes } = await runShadow({ sessionCount: 0, batchSize: 4 })

    expect(batchSizes).toEqual([])
    expect(report.batchCount).toBe(0)
    expect(report.readSessionCount).toBe(0)
    expect(report.fold.contributions).toEqual([])
  })

  it("reports coverage only for families the window could actually read", async () => {
    const { report } = await runShadow({ sessionCount: 4, batchSize: 2 })

    expect(report.familyCoverage).toEqual({ recovery: 1 })
  })

  it("reports family penalty distributions and no per-session Cost score", async () => {
    const { report } = await runShadow({ sessionCount: 4, batchSize: 2 })

    expect(report.familyDistributions.map(({ family }) => family)).toEqual(COST_FAMILIES)
    expect(report.familyDistributions.find(({ family }) => family === "recovery")).toEqual({
      family: "recovery",
      sessionCount: 4,
      deciles: Array.from({ length: 11 }, () => 0),
    })
    expect(
      report.familyDistributions.filter(({ family }) => family !== "recovery").map(({ sessionCount }) => sessionCount),
    ).toEqual([0, 0, 0, 0])
    for (const contribution of report.fold.contributions) {
      expect(contribution).not.toHaveProperty("cost")
      expect(contribution).not.toHaveProperty("score")
    }
  })

  it("reports the probe's counters as deltas over the run and heap as a peak", async () => {
    const { report } = await runShadow({
      sessionCount: 4,
      batchSize: 2,
      samples: [
        { queryCount: 10, rowsRead: 100, bytesRead: 1_000, heapUsedBytes: 5 },
        { queryCount: 14, rowsRead: 400, bytesRead: 9_000, heapUsedBytes: 40 },
        { queryCount: 19, rowsRead: 900, bytesRead: 21_000, heapUsedBytes: 20 },
      ],
    })

    expect(report.resources.queryCount).toBe(9)
    expect(report.resources.rowsRead).toBe(800)
    expect(report.resources.bytesRead).toBe(20_000)
    expect(report.resources.peakHeapUsedBytes).toBe(40)
    expect(report.resources.resolverMs).toBeGreaterThanOrEqual(0)
    expect(report.resources.slowestBatchMs).toBeLessThanOrEqual(report.resources.resolverMs)
  })

  it("omits resource counters no probe supplied instead of reporting zero", async () => {
    const { report } = await runShadow({ sessionCount: 2, batchSize: 2 })

    expect(report.resources.queryCount).toBeUndefined()
    expect(report.resources.rowsRead).toBeUndefined()
    expect(report.resources.bytesRead).toBeUndefined()
    expect(report.resources.peakHeapUsedBytes).toBeUndefined()
  })
})
