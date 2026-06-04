import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { MonitorAlertId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertIncident } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"
import { createAlertIncidentFromIssueEventUseCase } from "./create-alert-incident-from-issue-event.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function createTestLayers() {
  const events: OutboxWriteEvent[] = []
  const inserted: AlertIncident[] = []

  const AlertIncidentRepositoryTest = Layer.succeed(
    AlertIncidentRepository,
    AlertIncidentRepository.of({
      insert: (incident) =>
        Effect.sync(() => {
          inserted.push(incident)
        }),
      findById: () => Effect.die("findById not used in this test"),
      findOpen: () => Effect.succeed(null),
      closeOpen: () => Effect.succeed(null),
      updateExitDwell: () => Effect.void,
      listByProjectId: () => Effect.die("listByProjectId not used in this test"),
      listOpenByKind: () => Effect.die("listOpenByKind not used in this test"),
      listByMonitorId: () => Effect.die("listByMonitorId not used in this test"),
      statsByMonitorId: () => Effect.die("statsByMonitorId not used in this test"),
      listByMonitorAlertId: () => Effect.die("listByMonitorAlertId not used in this test"),
      findOpenByMonitorAlertId: () => Effect.die("findOpenByMonitorAlertId not used in this test"),
      existsByMonitorAlertId: () => Effect.die("existsByMonitorAlertId not used in this test"),
      setEndedAt: () => Effect.die("setEndedAt not used in this test"),
    }),
  )

  const OutboxEventWriterTest = Layer.succeed(
    OutboxEventWriter,
    OutboxEventWriter.of({
      write: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  )

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid("o")) }))

  return {
    events,
    inserted,
    layer: Layer.mergeAll(AlertIncidentRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

describe("createAlertIncidentFromIssueEventUseCase", () => {
  it("inserts an alert_incidents row and writes IncidentCreated when kind is issue.new", async () => {
    const { events, inserted, layer } = createTestLayers()
    const occurredAt = new Date("2026-05-06T10:00:00Z")

    const incident = await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.new",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      kind: "issue.new",
      severity: "medium",
      sourceType: "issue",
      sourceId: cuid("i"),
      startedAt: occurredAt,
      // Eventful kinds collapse to a single point in time: endedAt mirrors startedAt.
      endedAt: occurredAt,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IncidentCreated",
      aggregateType: "alert_incident",
      aggregateId: incident.id,
      organizationId: cuid("o"),
      payload: {
        organizationId: cuid("o"),
        projectId: cuid("p"),
        alertIncidentId: incident.id,
        kind: "issue.new",
        sourceType: "issue",
        sourceId: cuid("i"),
      },
    })
  })

  it("uses high severity and mirrors endedAt onto startedAt for issue.regressed", async () => {
    const { inserted, layer } = createTestLayers()
    const occurredAt = new Date("2026-05-06T11:00:00Z")

    await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.regressed",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted[0]?.severity).toBe("high")
    expect(inserted[0]?.kind).toBe("issue.regressed")
    expect(inserted[0]?.startedAt).toEqual(occurredAt)
    expect(inserted[0]?.endedAt).toEqual(occurredAt)
  })

  it("leaves endedAt null for issue.escalating so the lifecycle can be closed later", async () => {
    const { inserted, layer } = createTestLayers()
    const occurredAt = new Date("2026-05-06T12:00:00Z")

    await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.escalating",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted[0]?.kind).toBe("issue.escalating")
    expect(inserted[0]?.startedAt).toEqual(occurredAt)
    expect(inserted[0]?.endedAt).toBeNull()
  })

  it("defaults monitorAlertId and condition to null on the legacy/flag-off path", async () => {
    const { inserted, layer } = createTestLayers()
    await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.new",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt: new Date("2026-05-06T10:00:00Z"),
      }).pipe(Effect.provide(layer)),
    )
    expect(inserted[0]?.monitorAlertId).toBeNull()
    expect(inserted[0]?.condition).toBeNull()
  })

  it("stamps monitorAlertId and the condition snapshot on the monitor-owned path", async () => {
    const { inserted, layer } = createTestLayers()
    const monitorAlertId = MonitorAlertId(cuid("ma"))
    await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.escalating",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt: new Date("2026-05-06T12:00:00Z"),
        monitorAlertId,
        condition: { kind: "issue.escalating", sensitivity: 4 },
      }).pipe(Effect.provide(layer)),
    )
    expect(inserted[0]?.monitorAlertId).toBe(monitorAlertId)
    expect(inserted[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 4 })
  })
})
