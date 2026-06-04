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

const absoluteAlert: MonitorAlert = {
  id: alertId,
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.escalating",
  source: { type: "savedSearch", id: savedSearchId },
  condition: { kind: "savedSearch.escalating", threshold: { mode: "absolute", count: 5 }, window: { minutes: 10 } },
  severity: "high",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
}
const multiplierAlert: MonitorAlert = {
  ...absoluteAlert,
  condition: {
    kind: "savedSearch.escalating",
    threshold: { mode: "multiplier", factor: 2, baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } } },
    window: { minutes: 10 },
  },
}

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
  entrySignals: { evaluatedThreshold: 5 },
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

// 6 matches inside the 10-minute window clears the absolute threshold of 5.
const sustainedMatches = [9, 8, 6, 4, 2, 1].map(minsAgo)

describe("runSavedSearchEscalatingAlertUseCase", () => {
  it("opens with a frozen threshold snapshot and emits IncidentCreated", async () => {
    const first = minsAgo(9)
    const { result, incidents, events } = await run({ alert: absoluteAlert, matches: sustainedMatches })
    expect(result.transition).toBe("opened")
    expect(incidents[0]).toMatchObject({ startedAt: first, endedAt: null, entrySignals: { evaluatedThreshold: 5 } })
    expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
  })

  it("snapshots baseline + baselineCount for a multiplier open", async () => {
    const { incidents } = await run({ alert: multiplierAlert, matches: sustainedMatches })
    // window count 6; baseline = same 6 over 1h ⇒ normalised 1 ⇒ threshold 2.
    expect(incidents[0]?.entrySignals).toEqual({
      evaluatedThreshold: 2,
      baselineCount: 6,
      baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
    })
  })

  it("is a no-op while the condition keeps holding", async () => {
    const { result, events } = await run({ alert: absoluteAlert, matches: sustainedMatches, seed: [incident({})] })
    expect(result.transition).toBe("none")
    expect(events).toHaveLength(0)
  })

  it("starts the dwell when the condition first drops", async () => {
    const { result, incidents } = await run({ alert: absoluteAlert, matches: [minsAgo(2)], seed: [incident({})] })
    expect(result.transition).toBe("exit-eligible")
    expect(incidents[0]?.exitEligibleSince).toEqual(now)
  })

  it("cancels the dwell when the condition returns", async () => {
    const { result, incidents } = await run({
      alert: absoluteAlert,
      matches: sustainedMatches,
      seed: [incident({ exitEligibleSince: minsAgo(3) })],
    })
    expect(result.transition).toBe("exit-cancelled")
    expect(incidents[0]?.exitEligibleSince).toBeNull()
  })

  it("keeps waiting while still inside the dwell window", async () => {
    const { result, events } = await run({
      alert: absoluteAlert,
      matches: [minsAgo(1)],
      seed: [incident({ exitEligibleSince: minsAgo(5) })],
    })
    expect(result.transition).toBe("none")
    expect(events).toHaveLength(0)
  })

  it("closes and emits IncidentClosed once the dwell elapses", async () => {
    const { result, incidents, events } = await run({
      alert: absoluteAlert,
      matches: [],
      seed: [incident({ exitEligibleSince: minsAgo(15) })],
    })
    expect(result.transition).toBe("closed")
    expect(incidents[0]?.endedAt).toEqual(now)
    expect(events.map((event) => event.eventName)).toEqual(["IncidentClosed"])
  })

  it("opens an expected-mode escalating incident, freezing the seasonal threshold", async () => {
    const expectedAlert: MonitorAlert = {
      ...absoluteAlert,
      condition: {
        kind: "savedSearch.escalating",
        threshold: { mode: "expected", sensitivity: 3 },
        window: { minutes: 10 },
      },
    }
    // No seasonal history ⇒ expected 0, σ floor 1 ⇒ threshold = 3 × 1 = 3.
    // 5 matches in the 10-min window clears it; the frozen threshold is snapshotted.
    const { result, incidents } = await run({ alert: expectedAlert, matches: [9, 7, 5, 3, 1].map(minsAgo) })
    expect(result.transition).toBe("opened")
    expect(incidents[0]?.entrySignals).toEqual({ evaluatedThreshold: 3 })
  })

  it("compares the live count against the frozen threshold, not a re-resolved one", async () => {
    // Frozen threshold 10; only 5 matches now. A fresh multiplier resolve would
    // produce a tiny threshold the count would clear — the frozen value must win.
    const { result } = await run({
      alert: multiplierAlert,
      matches: [9, 7, 5, 3, 1].map(minsAgo),
      seed: [
        incident({
          kind: "savedSearch.escalating",
          entrySignals: {
            evaluatedThreshold: 10,
            baselineCount: 50,
            baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } },
          },
        }),
      ],
    })
    expect(result.transition).toBe("exit-eligible")
  })
})
