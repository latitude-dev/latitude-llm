import type { AlertIncident } from "@domain/alerts"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorAlert } from "../entities/monitor.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeSavedSearchMatchReader } from "../testing/fake-saved-search-match-reader.ts"
import { runSavedSearchEscalatingAlertUseCase } from "./run-saved-search-escalating-alert.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)
const alertId = "a".repeat(24) as MonitorAlert["id"]
const now = new Date("2026-06-01T12:00:00.000Z")
const minsAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000)

// A 5-minute window ⇒ 1-min buckets, N = 5, tolerance 0.1 ⇒ maxFail = max(1, floor(0.5)) = 1.
// `absolute count: 1` means every 1-min bucket needs ≥ 1 matching trace.
const absoluteAlert: MonitorAlert = {
  id: alertId,
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.escalating",
  source: { type: "savedSearch", id: savedSearchId },
  condition: { kind: "savedSearch.escalating", threshold: { mode: "absolute", count: 1 }, window: { minutes: 5 } },
  severity: "high",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
}
const multiplierAlert: MonitorAlert = {
  ...absoluteAlert,
  condition: {
    kind: "savedSearch.escalating",
    threshold: { mode: "multiplier", factor: 12, baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } } },
    window: { minutes: 5 },
  },
}
const expectedAlert: MonitorAlert = {
  ...absoluteAlert,
  condition: {
    kind: "savedSearch.escalating",
    threshold: { mode: "expected", sensitivity: 3 },
    window: { minutes: 5 },
  },
}

// One match landing in 1-min bucket `b` (b = 0 is the most recent minute before `now`).
const inBucket = (b: number, offsetMin = 0.5) => minsAgo(b + offsetMin)
// `count` matches all inside bucket `b` (offsets stay < 1 min so they share the bucket).
const fillBucket = (b: number, count: number): Date[] =>
  Array.from({ length: count }, (_unused, i) => minsAgo(b + 0.2 + i * 0.1))
// One match in every bucket 0..4 ⇒ a breach sustained across the whole window.
const sustained: readonly Date[] = [0, 1, 2, 3, 4].map((b) => inBucket(b))

const incident = (overrides: Partial<AlertIncident>): AlertIncident => ({
  id: "c".repeat(24) as AlertIncident["id"],
  organizationId,
  projectId,
  sourceType: "savedSearch",
  sourceId: savedSearchId,
  kind: "savedSearch.escalating",
  severity: "high",
  startedAt: minsAgo(60),
  endedAt: null,
  createdAt: minsAgo(60),
  entrySignals: { evaluatedThreshold: 1 },
  exitEligibleSince: null,
  monitorAlertId: alertId,
  condition: absoluteAlert.condition,
  ...overrides,
})

const run = (params: {
  readonly alert: MonitorAlert
  readonly matches: readonly Date[]
  readonly seed?: readonly AlertIncident[]
}) => {
  const store = createFakeAlertIncidentStore(params.seed ?? [])
  const events: OutboxWriteEvent[] = []
  return Effect.runPromise(
    runSavedSearchEscalatingAlertUseCase({
      organizationId,
      projectId,
      alert: params.alert,
      target: { query: null, filterSet: {} },
      now,
    }).pipe(
      Effect.provide(createFakeSavedSearchMatchReader(params.matches).layer),
      Effect.provide(store.layer),
      Effect.provideService(OutboxEventWriter, { write: (event) => Effect.sync(() => void events.push(event)) }),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  ).then((result) => ({ result, incidents: store.incidents, events }))
}

describe("runSavedSearchEscalatingAlertUseCase", () => {
  it("does not open on a one-shot spike confined to a single bucket", async () => {
    // 6 matches, all in the most recent minute ⇒ buckets 1..4 empty ⇒ failing 4 > maxFail 1.
    const { result, incidents, events } = await run({ alert: absoluteAlert, matches: fillBucket(0, 6) })
    expect(result.transition).toBe("none")
    expect(incidents).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it("opens when the threshold is sustained across every bucket, backtracing started_at and freezing the threshold", async () => {
    const { result, incidents, events } = await run({ alert: absoluteAlert, matches: sustained })
    expect(result.transition).toBe("opened")
    // started_at anchors to the earliest match in the window (~window start).
    expect(incidents[0]).toMatchObject({
      startedAt: inBucket(4),
      endedAt: null,
      entrySignals: { evaluatedThreshold: 1 },
    })
    expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
  })

  it("opens within the failing-bucket tolerance (one empty bucket allowed on N=5)", async () => {
    // Buckets 0..3 filled, bucket 4 empty ⇒ failing 1 ≤ maxFail 1 (exercises the min-1 floor).
    const { result } = await run({ alert: absoluteAlert, matches: [0, 1, 2, 3].map((b) => inBucket(b)) })
    expect(result.transition).toBe("opened")
  })

  it("does not open when failing buckets exceed the tolerance", async () => {
    // Only buckets 0..2 filled ⇒ 2 empty ⇒ failing 2 > maxFail 1.
    const { result, incidents } = await run({ alert: absoluteAlert, matches: [0, 1, 2].map((b) => inBucket(b)) })
    expect(result.transition).toBe("none")
    expect(incidents).toHaveLength(0)
  })

  it("freezes a per-bucket multiplier threshold + baselineCount on open", async () => {
    // baseline = same 5 matches over 1h ⇒ baselineCount 5; perBucket = 12 × 5 × (1m / 60m) = 1.
    const { result, incidents } = await run({ alert: multiplierAlert, matches: sustained })
    expect(result.transition).toBe("opened")
    expect(incidents[0]?.entrySignals).toEqual({
      evaluatedThreshold: 1,
      baselineCount: 5,
      baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
    })
  })

  it("opens an expected-mode escalating incident, freezing the seasonal per-bucket band", async () => {
    // No seasonal history ⇒ expected 0, σ floor 1 ⇒ perBucket threshold = 3 × 1 = 3.
    // 3 matches in each of the 5 buckets clears it everywhere.
    const matches = [0, 1, 2, 3, 4].flatMap((b) => fillBucket(b, 3))
    const { result, incidents } = await run({ alert: expectedAlert, matches })
    expect(result.transition).toBe("opened")
    expect(incidents[0]?.entrySignals).toEqual({ evaluatedThreshold: 3 })
  })

  it("is a no-op while the breach stays sustained on an open incident", async () => {
    const { result, events } = await run({ alert: absoluteAlert, matches: sustained, seed: [incident({})] })
    expect(result.transition).toBe("none")
    expect(events).toHaveLength(0)
  })

  it("closes and emits IncidentClosed once enough buckets drop below the frozen threshold", async () => {
    // Only buckets 0..1 still have matches ⇒ 3 empty ⇒ failing 3 > maxFail 1.
    const { result, incidents, events } = await run({
      alert: absoluteAlert,
      matches: [0, 1].map((b) => inBucket(b)),
      seed: [incident({})],
    })
    expect(result.transition).toBe("closed")
    expect(incidents[0]?.endedAt).toEqual(now)
    expect(events.map((event) => event.eventName)).toEqual(["IncidentClosed"])
  })

  it("counts failing buckets against the frozen threshold, not a re-resolved one", async () => {
    // Frozen per-bucket threshold 10; a fresh multiplier resolve would be ~1, which the sustained
    // 1-per-bucket traffic clears — but every bucket is below the frozen 10, so it must close.
    const { result, incidents } = await run({
      alert: multiplierAlert,
      matches: sustained,
      seed: [
        incident({
          entrySignals: {
            evaluatedThreshold: 10,
            baselineCount: 50,
            baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
          },
        }),
      ],
    })
    expect(result.transition).toBe("closed")
    expect(incidents[0]?.endedAt).toEqual(now)
  })
})
