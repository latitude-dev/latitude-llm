import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorAlert } from "../entities/monitor.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeSavedSearchMatchReader } from "../testing/fake-saved-search-match-reader.ts"
import { runSavedSearchMatchAlertUseCase } from "./run-saved-search-match-alert.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)
const now = new Date("2026-06-01T12:00:00.000Z")
const minsAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000)

const matchAlert: MonitorAlert = {
  id: "a".repeat(24) as MonitorAlert["id"],
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: savedSearchId },
  condition: null,
  severity: "low",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
}

const run = (matches: readonly Date[]) => {
  const store = createFakeAlertIncidentStore([])
  const events: OutboxWriteEvent[] = []
  return Effect.runPromise(
    runSavedSearchMatchAlertUseCase({
      organizationId,
      projectId,
      alert: matchAlert,
      target: { query: null, filterSet: {} },
      now,
    }).pipe(
      Effect.provide(createFakeSavedSearchMatchReader(matches).layer),
      Effect.provide(store.layer),
      Effect.provideService(OutboxEventWriter, { write: (event) => Effect.sync(() => void events.push(event)) }),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  ).then((result) => ({ result, incidents: store.incidents, events }))
}

describe("runSavedSearchMatchAlertUseCase", () => {
  it("writes a point-in-time incident at the first match in the window", async () => {
    const first = minsAgo(4)
    const { result, incidents, events } = await run([first, minsAgo(1)])
    expect(result.transition).toBe("fired")
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ startedAt: first, endedAt: first, severity: "low", condition: null })
    expect(events.map((event) => event.eventName)).toEqual(["IncidentCreated"])
  })

  it("does nothing when no trace matched in the window", async () => {
    const { result, incidents, events } = await run([minsAgo(10)])
    expect(result.transition).toBe("none")
    expect(incidents).toHaveLength(0)
    expect(events).toHaveLength(0)
  })
})
