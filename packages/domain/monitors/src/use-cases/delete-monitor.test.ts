import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { deleteMonitorUseCase, type Monitor, MonitorRepository } from "@domain/monitors"
import { createFakeAlertIncidentStore, createFakeMonitorRepository } from "@domain/monitors/testing"
import { AlertIncidentId, MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")
const target = {
  type: "user",
  id: null,
  kind: "user",
  stream: "traces",
  query: null,
  savedSearchId: null,
  metric: { kind: "count" },
} as const

const makeMonitor = (overrides: Partial<Monitor> = {}): Monitor => ({
  id: monitorId,
  organizationId,
  projectId,
  slug: "my-monitor",
  name: "My monitor",
  description: "",
  system: overrides.system ?? false,
  target,
  rule: { trigger: "match", config: {}, severity: "low" },
  lastEvaluatedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const provide = (
  repo: MonitorRepositoryShape,
  events: OutboxWriteEvent[] = [],
  incidentStore = createFakeAlertIncidentStore(),
) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    incidentStore.layer,
    Layer.succeed(
      OutboxEventWriter,
      OutboxEventWriter.of({
        write: (event) =>
          Effect.sync(() => {
            events.push(event)
          }),
      }),
    ),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

describe("deleteMonitorUseCase", () => {
  it("soft-deletes a user monitor", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ system: false })])
    const result = await Effect.runPromise(deleteMonitorUseCase({ id: monitorId }).pipe(Effect.provide(provide(repo))))
    expect(result.deletedAt).toBeInstanceOf(Date)
    expect(monitors[0]?.deletedAt).toBeInstanceOf(Date)
  })

  it("rejects deleting a system monitor and leaves it untouched", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ system: true })])
    const error = await Effect.runPromise(
      deleteMonitorUseCase({ id: monitorId }).pipe(Effect.flip, Effect.provide(provide(repo))),
    )
    expect(error._tag).toBe("SystemMonitorForbiddenError")
    expect(monitors[0]?.deletedAt).toBeNull()
  })

  it("closes open incidents as manual resolves so recovery notifications are suppressed", async () => {
    const incidentId = AlertIncidentId("i".repeat(24))
    const incidentStore = createFakeAlertIncidentStore([
      {
        id: incidentId,
        organizationId,
        projectId,
        sourceType: "monitor",
        sourceId: monitorId,
        severity: "high",
        startedAt: at,
        endedAt: null,
        createdAt: at,
        entrySignals: null,
        exitEligibleSince: null,
        condition: null,
      },
    ])
    const events: OutboxWriteEvent[] = []
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: false })])

    await Effect.runPromise(
      deleteMonitorUseCase({ id: monitorId }).pipe(Effect.provide(provide(repo, events, incidentStore))),
    )

    expect(incidentStore.incidents[0]?.endedAt).toBeInstanceOf(Date)
    expect(events[0]).toMatchObject({
      eventName: "IncidentClosed",
      aggregateId: incidentId,
      payload: { reason: "resolved", alertIncidentId: incidentId, sourceType: "monitor", sourceId: monitorId },
    })
  })
})
