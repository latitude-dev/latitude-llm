import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { ChSqlClient, OrganizationId, ProjectId, SavedSearchId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { createFakeSavedSearchMatchReader } from "../testing/fake-saved-search-match-reader.ts"
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
}) => {
  const { repo: monitorRepo } = createFakeMonitorRepository(params.monitors)
  const { repository: savedSearchRepo } = createFakeSavedSearchRepository(params.searches)
  const store = createFakeAlertIncidentStore([])
  const events: OutboxWriteEvent[] = []
  return Effect.runPromise(
    checkSavedSearchMonitorsUseCase({ organizationId, projectId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, monitorRepo),
          Layer.succeed(SavedSearchRepository, savedSearchRepo),
          store.layer,
          createFakeSavedSearchMatchReader(params.matches).layer,
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
})
