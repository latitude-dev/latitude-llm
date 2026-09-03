import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Incident, isSignalEscalationEntrySignals } from "@domain/incidents"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import {
  AlertIncidentId,
  ChSqlClient,
  type FilterSet,
  MonitorId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SavedSearchId,
  SqlClient,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Monitor } from "../entities/monitor.ts"
import { MetricSeriesReader } from "../ports/metric-series-reader.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import {
  createFakeAlertIncidentStore,
  createFakeCacheStore,
  createFakeMetricSeriesReader,
  createFakeMonitorRepository,
  type FakeMetricEventInput,
} from "../testing/index.ts"
import { checkMonitorsUseCase } from "./check-monitors.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const organizationId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const savedSearchId = SavedSearchId(cuid("s"))
const now = new Date("2026-06-23T12:00:00.000Z")

const monitor = ({ id, rule, ...edits }: Partial<Monitor> & Pick<Monitor, "id" | "rule">): Monitor => ({
  id,
  organizationId,
  projectId,
  slug: `monitor-${id}`,
  name: `Monitor ${id}`,
  description: "",
  system: false,
  target: {
    type: "savedSearch",
    id: savedSearchId,
    filterSet: {},
    kind: "savedSearch",
    stream: "traces",
    query: null,
    savedSearchId,
    metric: { kind: "count" },
  },
  rule,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-20T00:00:00.000Z"),
  updatedAt: new Date("2026-06-20T00:00:00.000Z"),
  ...edits,
})

const thresholdMonitorId = MonitorId(cuid("m-thr"))
const thresholdCondition = {
  trigger: "threshold" as const,
  metric: { kind: "count" as const },
  threshold: { mode: "absolute" as const, value: 2 },
  direction: "above" as const,
}
const thresholdMonitor = () =>
  monitor({
    id: thresholdMonitorId,
    rule: {
      trigger: "threshold",
      config: { metric: { kind: "count" }, condition: thresholdCondition },
      severity: "high",
    },
  })
const openThresholdIncident = (overrides: Partial<Incident> = {}): Incident => ({
  id: AlertIncidentId(cuid("ai-thr")),
  organizationId,
  projectId,
  sourceType: "monitor",
  sourceId: thresholdMonitorId,
  severity: "high",
  startedAt: new Date("2026-06-23T11:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-06-23T11:00:00.000Z"),
  entrySignals: { evaluatedThreshold: 2 },
  exitEligibleSince: null,
  condition: thresholdCondition,
  ...overrides,
})
// Two count-metric matches inside the current [now-5m, now) window ⇒ value 2 ⇒ meets `>= 2`.
const twoMatches = [new Date("2026-06-23T11:57:00.000Z"), new Date("2026-06-23T11:58:00.000Z")]

const layersFor = (
  monitors: readonly Monitor[],
  matches: readonly FakeMetricEventInput[],
  savedSearch: { readonly query: string | null; readonly filterSet: FilterSet } = { query: null, filterSet: {} },
  metricReaderLayer?: Layer.Layer<MetricSeriesReader>,
  seedIncidents: readonly Incident[] = [],
  // Threaded in when a test needs two consecutive checks to share the dedupe markers.
  cacheStore = createFakeCacheStore(),
) => {
  const monitorStore = createFakeMonitorRepository(monitors)
  const incidentStore = createFakeAlertIncidentStore(seedIncidents)
  const metricReader = createFakeMetricSeriesReader(matches)
  const savedSearchStore = createFakeSavedSearchRepository([
    {
      id: savedSearchId,
      organizationId,
      projectId,
      slug: "saved-search",
      name: "Saved search",
      query: savedSearch.query,
      filterSet: savedSearch.filterSet,
      deletedAt: null,
      createdAt: new Date("2026-06-20T00:00:00.000Z"),
      updatedAt: new Date("2026-06-20T00:00:00.000Z"),
    },
  ])
  const events: OutboxWriteEvent[] = []
  const outboxLayer = Layer.succeed(
    OutboxEventWriter,
    OutboxEventWriter.of({
      write: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  )
  const sqlLayer = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId }))
  const chLayer = Layer.succeed(ChSqlClient, null as never)

  return {
    events,
    incidents: incidentStore.incidents,
    metricCalls: metricReader.calls,
    dedupeKeys: cacheStore.entries,
    layer: Layer.mergeAll(
      Layer.succeed(MonitorRepository, monitorStore.repo),
      Layer.succeed(SavedSearchRepository, savedSearchStore.repository),
      incidentStore.layer,
      metricReaderLayer ?? metricReader.layer,
      cacheStore.layer,
      outboxLayer,
      sqlLayer,
      chLayer,
    ),
  }
}

describe("checkMonitorsUseCase", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates a point incident for a match monitor with recent activity", async () => {
    const firstMatch = new Date("2026-06-23T11:58:00.000Z")
    const { events, incidents, layer } = layersFor(
      [
        monitor({
          id: MonitorId(cuid("m1")),
          rule: { trigger: "match", config: {}, severity: "medium" },
        }),
      ],
      [firstMatch],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 1, evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      sourceType: "monitor",
      sourceId: MonitorId(cuid("m1")),
      severity: "medium",
      startedAt: firstMatch,
      endedAt: firstMatch,
      condition: null,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IncidentCreated",
      payload: {
        projectId,
        sourceType: "monitor",
        sourceId: MonitorId(cuid("m1")),
      },
    })
  })

  it("alerts on a long run whose activity is recent but which started before the window (LAT-885)", async () => {
    const longRun = {
      id: "long-run",
      startedAt: new Date("2026-06-23T11:22:00.000Z"),
      endedAt: new Date("2026-06-23T11:59:00.000Z"),
    }
    const { incidents, layer } = layersFor(
      [monitor({ id: MonitorId(cuid("m-long")), rule: { trigger: "match", config: {}, severity: "medium" } })],
      [longRun],
    )

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    // Windowed on the run's activity, backdated to when the run began.
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ startedAt: longRun.startedAt, endedAt: longRun.startedAt })
  })

  it("alerts once for a run that stays in the activity window across checks", async () => {
    const longRun = {
      id: "long-run",
      startedAt: new Date("2026-06-23T11:22:00.000Z"),
      endedAt: new Date("2026-06-23T11:59:00.000Z"),
    }
    const matchMonitor = monitor({
      id: MonitorId(cuid("m-dedupe")),
      rule: { trigger: "match", config: {}, severity: "medium" },
    })
    const { events, incidents, dedupeKeys, layer } = layersFor([matchMonitor], [longRun])

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))
    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(incidents).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect([...dedupeKeys.keys()]).toEqual([
      `org:${organizationId}:monitors:match-alerted:${matchMonitor.id}:${longRun.id}`,
    ])
  })

  it("alerts again for a different run, backdated to that run's start", async () => {
    const firstRun = {
      id: "run-1",
      startedAt: new Date("2026-06-23T11:22:00.000Z"),
      endedAt: new Date("2026-06-23T11:59:00.000Z"),
    }
    const secondRun = {
      id: "run-2",
      startedAt: new Date("2026-06-23T11:40:00.000Z"),
      endedAt: new Date("2026-06-23T11:59:30.000Z"),
    }
    const matchMonitor = monitor({
      id: MonitorId(cuid("m-second")),
      rule: { trigger: "match", config: {}, severity: "medium" },
    })
    const sharedCache = createFakeCacheStore()
    const first = layersFor([matchMonitor], [firstRun], undefined, undefined, [], sharedCache)

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(first.layer)))

    const second = layersFor([matchMonitor], [firstRun, secondRun], undefined, undefined, [], sharedCache)
    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(second.layer)))

    expect(first.incidents).toHaveLength(1)
    expect(first.incidents[0]).toMatchObject({ startedAt: firstRun.startedAt })
    // Only the new run is alerted for, so the incident backdates to its start, not the first run's.
    expect(second.incidents).toHaveLength(1)
    expect(second.incidents[0]).toMatchObject({ startedAt: secondRun.startedAt })
  })

  it("counts long runs still in the activity window towards a threshold", async () => {
    const longRuns = [
      {
        id: "long-run-1",
        startedAt: new Date("2026-06-23T11:22:00.000Z"),
        endedAt: new Date("2026-06-23T11:58:00.000Z"),
      },
      {
        id: "long-run-2",
        startedAt: new Date("2026-06-23T11:30:00.000Z"),
        endedAt: new Date("2026-06-23T11:59:00.000Z"),
      },
    ]
    const { incidents, layer } = layersFor([thresholdMonitor()], longRuns)

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      startedAt: longRuns[0]?.startedAt,
      entrySignals: { evaluatedThreshold: 2 },
    })
  })

  it("ignores a monitored predicate's fixed date range", async () => {
    const savedSearch = {
      query: null,
      filterSet: {
        userId: [{ op: "eq" as const, value: "user-1" }],
        startTime: [{ op: "gte" as const, value: "2026-06-01T00:00:00.000Z" }],
      },
    }
    const { metricCalls, layer } = layersFor(
      [monitor({ id: MonitorId(cuid("m-range")), rule: { trigger: "match", config: {}, severity: "medium" } })],
      [new Date("2026-06-23T11:58:00.000Z")],
      savedSearch,
    )

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(metricCalls[0]?.target.filterSet).toEqual({ userId: savedSearch.filterSet.userId })
  })

  it("resolves saved-search targets from the live saved search", async () => {
    const firstMatch = new Date("2026-06-23T11:58:00.000Z")
    const savedSearch = {
      query: '"payment failed"',
      filterSet: { userId: [{ op: "eq" as const, value: "user-1" }] },
    }
    const { metricCalls, layer } = layersFor(
      [
        monitor({
          id: MonitorId(cuid("m-live")),
          target: {
            type: "savedSearch",
            id: savedSearchId,
            filterSet: { userId: [{ op: "eq", value: "stale-user" }] },
            kind: "savedSearch",
            stream: "traces",
            query: null,
            savedSearchId,
            metric: { kind: "count" },
          },
          rule: { trigger: "match", config: {}, severity: "medium" },
        }),
      ],
      [firstMatch],
      savedSearch,
    )

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(metricCalls[0]?.target).toMatchObject({
      filterSet: savedSearch.filterSet,
      query: savedSearch.query,
      metric: { kind: "count" },
    })
  })

  it("opens an incident for a threshold monitor that breaches and freezes the threshold", async () => {
    const firstMatch = new Date("2026-06-23T11:57:30.000Z")
    const { events, incidents, layer } = layersFor(
      [thresholdMonitor()],
      [firstMatch, new Date("2026-06-23T11:58:30.000Z")],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 1, evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      sourceType: "monitor",
      sourceId: thresholdMonitorId,
      severity: "high",
      startedAt: firstMatch,
      endedAt: null,
      exitEligibleSince: null,
      entrySignals: { evaluatedThreshold: 2 },
      condition: thresholdCondition,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IncidentCreated",
      payload: { sourceType: "monitor", sourceId: thresholdMonitorId },
    })
  })

  it("does not re-open or re-notify while a threshold incident is open", async () => {
    const { events, incidents, layer } = layersFor([thresholdMonitor()], twoMatches, undefined, undefined, [
      openThresholdIncident(),
    ])

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 1, evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ endedAt: null, exitEligibleSince: null })
    expect(events).toHaveLength(0)
  })

  it("starts the exit dwell when a threshold condition clears", async () => {
    const { events, incidents, layer } = layersFor([thresholdMonitor()], [], undefined, undefined, [
      openThresholdIncident(),
    ])

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ endedAt: null, exitEligibleSince: now })
    expect(events).toHaveLength(0)
  })

  it("holds a threshold incident open during the exit dwell", async () => {
    const exitEligibleSince = new Date("2026-06-23T11:45:00.000Z") // 15 min before now
    const { events, incidents, layer } = layersFor([thresholdMonitor()], [], undefined, undefined, [
      openThresholdIncident({ exitEligibleSince }),
    ])

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(incidents[0]).toMatchObject({ endedAt: null, exitEligibleSince })
    expect(events).toHaveLength(0)
  })

  it("closes a threshold incident silently after the exit dwell elapses", async () => {
    const exitEligibleSince = new Date("2026-06-23T11:29:00.000Z") // 31 min before now
    const { events, incidents, layer } = layersFor([thresholdMonitor()], [], undefined, undefined, [
      openThresholdIncident({ exitEligibleSince }),
    ])

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    // Closed at the moment it cleared, and silently — no IncidentClosed event, so no recovery email.
    expect(incidents[0]).toMatchObject({ endedAt: exitEligibleSince })
    expect(events).toHaveLength(0)
  })

  it("resets the exit dwell when a threshold breach resumes", async () => {
    const exitEligibleSince = new Date("2026-06-23T11:45:00.000Z")
    const { events, incidents, layer } = layersFor([thresholdMonitor()], twoMatches, undefined, undefined, [
      openThresholdIncident({ exitEligibleSince }),
    ])

    await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(incidents[0]).toMatchObject({ endedAt: null, exitEligibleSince: null })
    expect(events).toHaveLength(0)
  })

  it("opens an escalating monitor incident through the sustained state machine", async () => {
    const monitorId = MonitorId(cuid("m-esc"))
    const condition = {
      trigger: "escalating" as const,
      metric: { kind: "count" as const },
      threshold: { mode: "expected" as const, sensitivity: 3 },
      sensitivity: 3,
    }
    const eventsInSpike = Array.from(
      { length: 6 },
      (_, index) => new Date(`2026-06-23T10:${String(index).padStart(2, "0")}:00.000Z`),
    )
    const eventsInCurrentHour = Array.from(
      { length: 20 },
      (_, index) => new Date(`2026-06-23T11:${String(index).padStart(2, "0")}:00.000Z`),
    )
    const { events, incidents, layer } = layersFor(
      [
        monitor({
          id: monitorId,
          rule: {
            trigger: "escalating",
            config: { metric: { kind: "count" }, condition },
            severity: "high",
          },
        }),
      ],
      [...eventsInSpike, ...eventsInCurrentHour],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 1, evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      sourceType: "monitor",
      sourceId: monitorId,
      severity: "high",
      startedAt: new Date("2026-06-23T10:00:00.000Z"),
      endedAt: null,
      condition,
    })
    const entrySignals = incidents[0]?.entrySignals ?? null
    expect(isSignalEscalationEntrySignals(entrySignals)).toBe(true)
    if (isSignalEscalationEntrySignals(entrySignals)) {
      expect(entrySignals.entryCount24h).toBe(26)
    }
    expect(events[0]).toMatchObject({ eventName: "IncidentCreated", aggregateType: "alert_incident" })
  })

  it("closes an open escalating monitor incident after exit dwell", async () => {
    const monitorId = MonitorId(cuid("m-exit"))
    const incidentId = AlertIncidentId(cuid("ai-exit"))
    const condition = {
      trigger: "escalating" as const,
      metric: { kind: "count" as const },
      threshold: { mode: "expected" as const, sensitivity: 3 },
      sensitivity: 3,
    }
    const openIncident: Incident = {
      id: incidentId,
      organizationId,
      projectId,
      sourceType: "monitor",
      sourceId: monitorId,
      severity: "high",
      startedAt: new Date("2026-06-23T10:00:00.000Z"),
      endedAt: null,
      createdAt: new Date("2026-06-23T10:05:00.000Z"),
      entrySignals: {
        expected1h: 0,
        expected6hPerHour: 0,
        stddev1h: 0,
        stddev6hPerHour: 0,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 0,
        entryThreshold6hPerHour: 0,
        entryCount24h: 30,
      },
      exitEligibleSince: new Date("2026-06-23T11:29:00.000Z"),
      condition,
    }
    const { events, incidents, layer } = layersFor(
      [
        monitor({
          id: monitorId,
          rule: {
            trigger: "escalating",
            config: { metric: { kind: "count" }, condition },
            severity: "high",
          },
        }),
      ],
      [],
      { query: null, filterSet: {} },
      undefined,
      [openIncident],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 1, evaluated: 1, failed: 0 })
    expect(incidents[0]).toMatchObject({ id: incidentId, endedAt: now })
    expect(events[0]).toMatchObject({
      eventName: "IncidentClosed",
      aggregateType: "alert_incident",
      aggregateId: incidentId,
      payload: { reason: "absolute-rate-drop", sourceType: "monitor", sourceId: monitorId },
    })
  })

  it("does not evaluate muted point monitors", async () => {
    const { incidents, layer } = layersFor(
      [
        monitor({
          id: MonitorId(cuid("m3")),
          mutedAt: new Date("2026-06-22T00:00:00.000Z"),
          rule: { trigger: "match", config: {}, severity: "medium" },
        }),
      ],
      [new Date("2026-06-23T11:58:00.000Z")],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluatable: 0, evaluated: 0, failed: 0 })
    expect(incidents).toHaveLength(0)
  })

  it("continues evaluating other monitors when one monitor read fails", async () => {
    const firstMatch = new Date("2026-06-23T11:58:00.000Z")
    const goodMonitorId = MonitorId(cuid("m-good"))
    const badMonitorId = MonitorId(cuid("m-bad"))
    const failingMetricLayer = Layer.succeed(MetricSeriesReader, {
      valueInWindow: (input) =>
        input.target.filterSet.userId
          ? Effect.fail(new RepositoryError({ operation: "read metric series", cause: new Error("reader failed") }))
          : Effect.succeed(1),
      matchingEntities: (input) =>
        input.target.filterSet.userId
          ? Effect.fail(new RepositoryError({ operation: "read metric series", cause: new Error("reader failed") }))
          : Effect.succeed([{ id: "entity-good", startTime: firstMatch }]),
      firstEventAt: () => Effect.succeed(firstMatch),
      lastEventAt: () => Effect.succeed(firstMatch),
      seriesPerBucket: () => Effect.succeed([]),
    })
    const { incidents, layer } = layersFor(
      [
        monitor({
          id: badMonitorId,
          target: {
            type: "user",
            id: null,
            filterSet: { userId: [{ op: "eq", value: "bad-user" }] },
            kind: "user",
            stream: "traces",
            query: null,
            savedSearchId: null,
            metric: { kind: "count" },
          },
          rule: { trigger: "match", config: {}, severity: "medium" },
        }),
        monitor({
          id: goodMonitorId,
          target: {
            type: "user",
            id: null,
            filterSet: {},
            kind: "user",
            stream: "traces",
            query: null,
            savedSearchId: null,
            metric: { kind: "count" },
          },
          rule: { trigger: "match", config: {}, severity: "high" },
        }),
      ],
      [firstMatch],
      { query: null, filterSet: {} },
      failingMetricLayer,
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 2, evaluatable: 2, evaluated: 1, failed: 1 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]?.sourceId).toBe(goodMonitorId)
  })

  it("reports all monitor failures so the worker can retry systemic outages", async () => {
    const failingMetricLayer = Layer.succeed(MetricSeriesReader, {
      valueInWindow: () =>
        Effect.fail(new RepositoryError({ operation: "read metric series", cause: new Error("reader failed") })),
      matchingEntities: () =>
        Effect.fail(new RepositoryError({ operation: "read metric series", cause: new Error("reader failed") })),
      firstEventAt: () => Effect.succeed(null),
      lastEventAt: () => Effect.succeed(null),
      seriesPerBucket: () => Effect.succeed([]),
    })
    const { layer } = layersFor(
      [
        monitor({ id: MonitorId(cuid("m-one")), rule: { trigger: "match", config: {}, severity: "medium" } }),
        monitor({ id: MonitorId(cuid("m-two")), rule: { trigger: "match", config: {}, severity: "high" } }),
      ],
      [],
      { query: null, filterSet: {} },
      failingMetricLayer,
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 2, evaluatable: 2, evaluated: 0, failed: 2 })
  })
})
