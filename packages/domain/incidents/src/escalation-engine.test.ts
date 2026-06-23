import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ESCALATION_EXIT_DWELL_MS, evaluateSeasonalEscalation, makeEscalationEngine } from "./escalation-engine.ts"
import type { SeriesReaderShape } from "./ports/series-reader.ts"
import { SeriesReader } from "./ports/series-reader.ts"

const now = new Date("2026-06-23T12:00:00.000Z")

const seasonal = {
  recent1h: 30,
  recent6h: 180,
  recent24h: 300,
  expected1h: 5,
  expected6hPerHour: 5,
  stddev1h: 1,
  stddev6hPerHour: 1,
  samplesCount: 4,
}

const runEngine = (
  reader: SeriesReaderShape,
  overrides: Partial<Parameters<ReturnType<typeof makeEscalationEngine>["evaluate"]>[0]> = {},
) =>
  Effect.runPromise(
    makeEscalationEngine()
      .evaluate({
        organizationId: OrganizationId("org1"),
        projectId: ProjectId("proj1"),
        sourceId: "source1",
        kShort: 3,
        isNew: false,
        wasEscalating: false,
        entrySignals: null,
        startedAt: null,
        exitEligibleSince: null,
        now,
        ...overrides,
      })
      .pipe(Effect.provideService(SeriesReader, reader), Effect.provideService(ChSqlClient, null as never)),
  )

const fakeReader = (input: Partial<SeriesReaderShape> = {}): SeriesReaderShape => ({
  readSeasonalSeries: () => Effect.succeed(seasonal),
  readCrossingBuckets: () =>
    Effect.succeed({
      counts: [
        { bucket: "2026-06-23T09:00:00.000Z", count: 1 },
        { bucket: "2026-06-23T10:00:00.000Z", count: 12 },
        { bucket: "2026-06-23T11:00:00.000Z", count: 14 },
      ],
      thresholds: [
        { bucket: "2026-06-23T09:00:00.000Z", thresholdCount: 10 },
        { bucket: "2026-06-23T10:00:00.000Z", thresholdCount: 10 },
        { bucket: "2026-06-23T11:00:00.000Z", thresholdCount: 10 },
      ],
    }),
  ...input,
})

describe("EscalationEngine", () => {
  it("enters and backtracks to the first crossing bucket", async () => {
    const decision = await runEngine(fakeReader())

    expect(decision.transition).toBe("enter")
    expect(decision.transitionAt).toEqual(new Date("2026-06-23T10:00:00.000Z"))
    expect(decision.entrySignalsSnapshot?.entryCount24h).toBe(300)
  })

  it("starts exit dwell instead of closing immediately", () => {
    const decision = evaluateSeasonalEscalation({
      signals: { ...seasonal, recent1h: 0, recent6h: 0, recent24h: 260 },
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: {
        ...seasonal,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 8,
        entryThreshold6hPerHour: 7,
        entryCount24h: 300,
      },
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      exitEligibleSince: null,
      now,
    })

    expect(decision).toEqual({ transition: "none", nextExitEligibleSince: now })
  })

  it("exits after dwell and backtracks to the last crossing bucket", async () => {
    const decision = await runEngine(
      fakeReader({
        readSeasonalSeries: () => Effect.succeed({ ...seasonal, recent1h: 0, recent6h: 0, recent24h: 260 }),
      }),
      {
        wasEscalating: true,
        entrySignals: {
          ...seasonal,
          kShort: 3,
          kLong: 2,
          entryThreshold1h: 8,
          entryThreshold6hPerHour: 7,
          entryCount24h: 300,
        },
        startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        exitEligibleSince: new Date(now.getTime() - ESCALATION_EXIT_DWELL_MS),
      },
    )

    expect(decision.transition).toBe("exit")
    expect(decision.reason).toBe("threshold")
    expect(decision.transitionAt).toEqual(new Date("2026-06-23T11:00:00.000Z"))
  })
})
