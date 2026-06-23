import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { ChSqlClient, MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import {
  createFakeAlertIncidentStore,
  createFakeMetricSeriesReader,
  createFakeMonitorRepository,
} from "../testing/index.ts"
import { checkMonitorsUseCase } from "./check-monitors.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const organizationId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
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
    id: cuid("s"),
    filterSet: {},
    kind: "savedSearch",
    stream: "traces",
    query: null,
    savedSearchId: cuid("s"),
    metric: { kind: "count" },
  },
  rule,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-20T00:00:00.000Z"),
  updatedAt: new Date("2026-06-20T00:00:00.000Z"),
  ...edits,
})

const layersFor = (monitors: readonly Monitor[], matches: readonly Date[]) => {
  const monitorStore = createFakeMonitorRepository(monitors)
  const incidentStore = createFakeAlertIncidentStore()
  const metricReader = createFakeMetricSeriesReader(matches)
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
    layer: Layer.mergeAll(
      Layer.succeed(MonitorRepository, monitorStore.repo),
      incidentStore.layer,
      metricReader.layer,
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

    expect(result).toEqual({ checked: 1, evaluated: 1 })
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

  it("creates a point incident for a threshold monitor that breaches", async () => {
    const firstMatch = new Date("2026-06-23T11:57:30.000Z")
    const condition = {
      trigger: "threshold" as const,
      metric: { kind: "count" as const },
      threshold: { mode: "absolute" as const, value: 2 },
      direction: "above" as const,
    }
    const { incidents, layer } = layersFor(
      [
        monitor({
          id: MonitorId(cuid("m2")),
          rule: {
            trigger: "threshold",
            config: { metric: { kind: "count" }, condition },
            severity: "high",
          },
        }),
      ],
      [firstMatch, new Date("2026-06-23T11:58:30.000Z")],
    )

    const result = await Effect.runPromise(checkMonitorsUseCase({ projectId }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ checked: 1, evaluated: 1 })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      sourceType: "monitor",
      sourceId: MonitorId(cuid("m2")),
      severity: "high",
      startedAt: firstMatch,
      endedAt: firstMatch,
      condition,
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

    expect(result).toEqual({ checked: 1, evaluated: 0 })
    expect(incidents).toHaveLength(0)
  })
})
