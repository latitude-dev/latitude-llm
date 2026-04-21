import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Trace } from "../entities/trace.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { createFakeTraceRepository } from "../testing/fake-trace-repository.ts"
import { buildTracesExportUseCase } from "./build-traces-export.ts"

const organizationId = "o".repeat(24) as Trace["organizationId"]
const projectId = "p".repeat(24) as Trace["projectId"]

const makeTrace = (traceId: string, overrides: Partial<Trace> = {}): Trace =>
  ({
    organizationId,
    projectId,
    traceId: traceId as Trace["traceId"],
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-04-10T10:00:00.000Z"),
    endTime: new Date("2026-04-10T10:00:01.000Z"),
    durationNs: 1_000_000,
    timeToFirstTokenNs: 500_000,
    tokensInput: 10,
    tokensOutput: 20,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 30,
    costInputMicrocents: 1,
    costOutputMicrocents: 2,
    costTotalMicrocents: 3,
    sessionId: "session-1" as Trace["sessionId"],
    userId: "user-1" as Trace["userId"],
    simulationId: "",
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: "span-1" as Trace["rootSpanId"],
    rootSpanName: "root",
    ...overrides,
  }) satisfies Trace

describe("buildTracesExportUseCase", () => {
  it("exports only the selected traces that still match the active filters", async () => {
    const firstTrace = makeTrace("a".repeat(32), { rootSpanName: "alpha" })
    const secondTrace = makeTrace("b".repeat(32), { rootSpanName: "beta" })
    const { repository } = createFakeTraceRepository({
      listByTraceIds: () =>
        Effect.succeed([
          { ...secondTrace, systemInstructions: [], inputMessages: [], outputMessages: [], allMessages: [] },
          { ...firstTrace, systemInstructions: [], inputMessages: [], outputMessages: [], allMessages: [] },
        ] as never),
      matchesFiltersByTraceId: ({ traceId }) => Effect.succeed(traceId === firstTrace.traceId),
    })

    const result = await Effect.runPromise(
      buildTracesExportUseCase({
        organizationId,
        projectId,
        filters: { tags: [{ op: "contains", value: "important" }] },
        selection: { mode: "selected", rowIds: [firstTrace.traceId, secondTrace.traceId] },
      }).pipe(Effect.provideService(TraceRepository, repository)),
    )

    expect(result.csv).toContain(`${firstTrace.traceId},1,0`)
    expect(result.csv).not.toContain(secondTrace.traceId)
  })
})
