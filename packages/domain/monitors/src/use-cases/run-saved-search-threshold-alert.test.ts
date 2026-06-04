import type { AlertIncident } from "@domain/alerts"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { createFakeSavedSearchMatchReader } from "../testing/fake-saved-search-match-reader.ts"
import { runSavedSearchThresholdAlertUseCase } from "./run-saved-search-threshold-alert.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)
const alertId = "a".repeat(24) as MonitorAlert["id"]
const now = new Date("2026-06-01T12:00:00.000Z")
const minsAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000)

const alert = (condition: MonitorAlert["condition"]): MonitorAlert => ({
  id: alertId,
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.threshold",
  source: { type: "savedSearch", id: savedSearchId },
  condition,
  severity: "medium",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
})

const incident = (overrides: Partial<AlertIncident>): AlertIncident => ({
  id: "c".repeat(24) as AlertIncident["id"],
  organizationId,
  projectId,
  sourceType: "savedSearch",
  sourceId: savedSearchId,
  kind: "savedSearch.threshold",
  severity: "medium",
  startedAt: minsAgo(30),
  endedAt: null,
  createdAt: minsAgo(30),
  entrySignals: null,
  exitEligibleSince: null,
  monitorAlertId: alertId,
  condition: null,
  ...overrides,
})

const run = (params: {
  readonly alert: MonitorAlert
  readonly matches: readonly Date[]
  readonly seed?: readonly AlertIncident[]
}) => {
  const store = createFakeAlertIncidentStore(params.seed ?? [])
  const events: OutboxWriteEvent[] = []
  const { repo: monitorRepo } = createFakeMonitorRepository([])
  return Effect.runPromise(
    runSavedSearchThresholdAlertUseCase({
      organizationId,
      projectId,
      alert: params.alert,
      target: { query: null, filterSet: {} },
      now,
    }).pipe(
      Effect.provide(createFakeSavedSearchMatchReader(params.matches).layer),
      Effect.provide(store.layer),
      Effect.provideService(MonitorRepository, monitorRepo),
      Effect.provideService(OutboxEventWriter, { write: (event) => Effect.sync(() => void events.push(event)) }),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  ).then((result) => ({ result, incidents: store.incidents, events }))
}

const absoluteAlert = alert({ kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 5 } })
const multiplierAlert = alert({
  kind: "savedSearch.threshold",
  threshold: { mode: "multiplier", factor: 1, baseline: { kind: "average", lookback: { unit: "hours", hours: 1 } } },
})

describe("runSavedSearchThresholdAlertUseCase", () => {
  describe("absolute (one-time)", () => {
    it("fires a point-in-time incident at the first match when the count crosses", async () => {
      const first = minsAgo(300)
      const { result, incidents, events } = await run({
        alert: absoluteAlert,
        matches: [first, minsAgo(200), minsAgo(100), minsAgo(50), minsAgo(10)],
      })
      expect(result.transition).toBe("fired")
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({
        startedAt: first,
        endedAt: first,
        monitorAlertId: alertId,
        entrySignals: null,
      })
      expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
    })

    it("short-circuits once spent — any prior incident blocks a re-fire", async () => {
      const { result, incidents, events } = await run({
        alert: absoluteAlert,
        matches: [minsAgo(300), minsAgo(200), minsAgo(100), minsAgo(50), minsAgo(10)],
        seed: [incident({ endedAt: minsAgo(400) })],
      })
      expect(result.transition).toBe("none")
      expect(incidents).toHaveLength(1)
      expect(events).toHaveLength(0)
    })

    it("does not fire below the threshold", async () => {
      const { result, incidents } = await run({ alert: absoluteAlert, matches: [minsAgo(100), minsAgo(10)] })
      expect(result.transition).toBe("none")
      expect(incidents).toHaveLength(0)
    })
  })

  describe("multiplier (rearm)", () => {
    it("opens an incident on the rising edge with a single IncidentCreated", async () => {
      const first = minsAgo(4)
      const { result, incidents, events } = await run({
        alert: multiplierAlert,
        matches: [first, minsAgo(2), minsAgo(1)],
      })
      expect(result.transition).toBe("opened")
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ startedAt: first, endedAt: null, entrySignals: null })
      expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
    })

    it("silently closes (no notification) when the condition drops", async () => {
      const { result, incidents, events } = await run({
        alert: multiplierAlert,
        matches: [],
        seed: [incident({ endedAt: null })],
      })
      expect(result.transition).toBe("closed")
      expect(incidents[0]?.endedAt).toEqual(now)
      expect(events).toHaveLength(0)
    })

    it("is a no-op while the spike still holds", async () => {
      const { result, incidents, events } = await run({
        alert: multiplierAlert,
        matches: [minsAgo(2), minsAgo(1)],
        seed: [incident({ endedAt: null })],
      })
      expect(result.transition).toBe("none")
      expect(incidents).toHaveLength(1)
      expect(events).toHaveLength(0)
    })
  })
})
