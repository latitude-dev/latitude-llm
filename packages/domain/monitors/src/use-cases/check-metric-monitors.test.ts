import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { ChSqlClient, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert, MonitorTarget } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeAlertIncidentStore } from "../testing/fake-alert-incident-store.ts"
import { createFakeMetricSeriesReader } from "../testing/fake-metric-series-reader.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { checkMetricMonitorsUseCase } from "./check-metric-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = "m".repeat(24) as Monitor["id"]
const alertId = "a".repeat(24) as MonitorAlert["id"]
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000)

const toolTarget: MonitorTarget = {
  kind: "tool",
  stream: "spans",
  filterSet: { operation: [{ op: "eq", value: "execute_tool" }] },
  query: null,
  savedSearchId: null,
  metric: { kind: "count" },
}

const thresholdAlert: MonitorAlert = {
  id: alertId,
  monitorId,
  kind: "metric.threshold",
  source: null,
  condition: { kind: "metric.threshold", metric: { kind: "count" }, threshold: { mode: "absolute", value: 2 } },
  severity: "high",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
}

const monitor = (alerts: readonly MonitorAlert[], target: MonitorTarget | null): Monitor => ({
  id: monitorId,
  organizationId,
  projectId,
  slug: "tool-errors",
  name: "Tool errors",
  description: "",
  system: false,
  alerts,
  target,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
})

const run = (params: { readonly monitors: readonly Monitor[]; readonly matches: readonly Date[] }) => {
  const { repo: monitorRepo } = createFakeMonitorRepository(params.monitors)
  const { repository: savedSearchRepo } = createFakeSavedSearchRepository([])
  const store = createFakeAlertIncidentStore([])
  const events: OutboxWriteEvent[] = []

  return Effect.runPromise(
    checkMetricMonitorsUseCase({ organizationId, projectId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, monitorRepo),
          Layer.succeed(SavedSearchRepository, savedSearchRepo),
          store.layer,
          createFakeMetricSeriesReader(params.matches).layer,
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          Layer.succeed(
            OutboxEventWriter,
            OutboxEventWriter.of({ write: (e) => Effect.sync(() => void events.push(e)) }),
          ),
        ),
      ),
    ),
  ).then((result) => ({ result, incidents: store.incidents, events }))
}

describe("checkMetricMonitorsUseCase", () => {
  it("opens a sourceless incident when a metric.threshold monitor's metric crosses the threshold", async () => {
    const { result, incidents } = await run({
      monitors: [monitor([thresholdAlert], toolTarget)],
      matches: [minutesAgo(1), minutesAgo(2), minutesAgo(3)], // 3 in the 5-min window ≥ threshold 2
    })
    expect(result).toEqual({ evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      monitorAlertId: alertId,
      kind: "metric.threshold",
      sourceType: null,
      sourceId: null,
      endedAt: null, // rearm: opened and held while over threshold
    })
  })

  it("does not open an incident when the metric is below the threshold", async () => {
    const { result, incidents } = await run({
      monitors: [monitor([thresholdAlert], toolTarget)],
      matches: [minutesAgo(1)], // value 1 < threshold 2
    })
    expect(result).toEqual({ evaluated: 1, failed: 0 })
    expect(incidents).toHaveLength(0)
  })

  it("ignores monitors without a target (legacy saved-search monitors)", async () => {
    const { result, incidents } = await run({
      monitors: [
        monitor(
          [
            {
              ...thresholdAlert,
              kind: "savedSearch.match",
              source: { type: "savedSearch", id: "s".repeat(24) },
              condition: null,
            },
          ],
          null,
        ),
      ],
      matches: [minutesAgo(1), minutesAgo(2), minutesAgo(3)],
    })
    expect(result).toEqual({ evaluated: 0, failed: 0 })
    expect(incidents).toHaveLength(0)
  })
})
