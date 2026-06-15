import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { ChSqlClient, OrganizationId, ProjectId, SavedSearchId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import { MetricSeriesReader } from "../ports/metric-series-reader.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeMetricSeriesReader } from "../testing/fake-metric-series-reader.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { checkSavedSearchMonitorsUseCase } from "./check-saved-search-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const searchId = "s".repeat(24)
const now = new Date()

const monitor = (alerts: readonly MonitorAlert[]): Monitor => ({
  id: "m".repeat(24) as Monitor["id"],
  organizationId,
  projectId,
  slug: "user-monitor",
  name: "User monitor",
  description: "",
  system: false,
  alerts,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
})

const matchAlert: MonitorAlert = {
  id: "a".repeat(24) as MonitorAlert["id"],
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: searchId },
  condition: null,
  severity: "low",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
}

const savedSearch = {
  id: SavedSearchId(searchId),
  organizationId,
  projectId,
  slug: "errors",
  name: "Errors",
  query: "boom",
  filterSet: {},
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const run = (params: {
  readonly monitors: readonly Monitor[]
  readonly searches: readonly (typeof savedSearch)[]
  readonly matches: readonly Date[]
  readonly defectQueries?: readonly string[]
}) => {
  const { repo: monitorRepo } = createFakeMonitorRepository(params.monitors)
  const { repository: savedSearchRepo } = createFakeSavedSearchRepository(params.searches)
  const store = createFakeAlertIncidentStore([])
  const events: OutboxWriteEvent[] = []

  const defectQueries = new Set(params.defectQueries ?? [])
  const readerLayer = Layer.effect(
    MetricSeriesReader,
    Effect.gen(function* () {
      const real = yield* MetricSeriesReader
      const guard =
        <I extends { readonly target: { readonly query: string | null } }, A, E, R>(
          call: (input: I) => Effect.Effect<A, E, R>,
        ) =>
        (input: I): Effect.Effect<A, E, R> =>
          defectQueries.has(input.target.query ?? "")
            ? Effect.sync(() => {
                throw new Error("Unsupported filter operator: gtePercentile")
              })
            : call(input)
      return {
        valueInWindow: guard(real.valueInWindow),
        firstEventAt: guard(real.firstEventAt),
        lastEventAt: guard(real.lastEventAt),
        seriesPerBucket: guard(real.seriesPerBucket),
      }
    }),
  ).pipe(Layer.provide(createFakeMetricSeriesReader(params.matches).layer))

  return Effect.runPromise(
    checkSavedSearchMonitorsUseCase({ organizationId, projectId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, monitorRepo),
          Layer.succeed(SavedSearchRepository, savedSearchRepo),
          store.layer,
          readerLayer,
          Layer.succeed(OutboxEventWriter, { write: (event) => Effect.sync(() => void events.push(event)) }),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
        ),
      ),
    ),
  ).then((result) => ({ result, incidents: store.incidents, events }))
}

describe("checkSavedSearchMonitorsUseCase", () => {
  it("evaluates active saved-search alerts and fires the matching ones", async () => {
    const { result, incidents, events } = await run({
      monitors: [monitor([matchAlert])],
      searches: [savedSearch],
      matches: [new Date(now.getTime() - 60 * 1000)],
    })
    expect(result).toEqual({ evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ kind: "savedSearch.match", monitorAlertId: matchAlert.id })
    expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
  })

  it("skips an alert whose saved search no longer exists (counts it, fires nothing)", async () => {
    const { result, incidents } = await run({
      monitors: [monitor([matchAlert])],
      searches: [],
      matches: [new Date(now.getTime() - 60 * 1000)],
    })
    expect(result).toEqual({ evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(0)
  })

  it("does nothing when there are no active saved-search alerts", async () => {
    const { result, incidents } = await run({ monitors: [], searches: [], matches: [] })
    expect(result).toEqual({ evaluated: 0, failed: 0 })
    expect(incidents).toHaveLength(0)
  })

  it("isolates an alert whose evaluation dies with a defect and still evaluates the rest", async () => {
    const badSearchId = "b".repeat(24)
    const badSearch = {
      ...savedSearch,
      id: SavedSearchId(badSearchId),
      slug: "p95-latency",
      name: "P95 latency",
      query: "explode",
    }
    const badAlert: MonitorAlert = {
      ...matchAlert,
      id: "z".repeat(24) as MonitorAlert["id"],
      source: { type: "savedSearch", id: badSearchId },
    }

    // The defective alert comes first, proving the sweep continues past it.
    const { result, incidents } = await run({
      monitors: [monitor([badAlert, matchAlert])],
      searches: [badSearch, savedSearch],
      matches: [new Date(now.getTime() - 60 * 1000)],
      defectQueries: ["explode"],
    })

    expect(result).toEqual({ evaluated: 2, failed: 1 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ kind: "savedSearch.match", monitorAlertId: matchAlert.id })
  })
})
