import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Incident } from "../entities/incident.ts"
import { IncidentRepository } from "../ports/incident-repository.ts"
import { createIncidentFromSignalEventUseCase } from "./create-incident-from-signal-event.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function createTestLayers() {
  const events: OutboxWriteEvent[] = []
  const inserted: Incident[] = []

  const IncidentRepositoryTest = Layer.succeed(
    IncidentRepository,
    IncidentRepository.of({
      insert: (incident) =>
        Effect.sync(() => {
          inserted.push(incident)
        }),
      findById: () => Effect.die("findById not used in this test"),
      findOpen: () => Effect.succeed(null),
      closeOpen: () => Effect.succeed(null),
      updateExitDwell: () => Effect.void,
      listByProjectId: () => Effect.die("listByProjectId not used in this test"),
      listOpenBySourceType: () => Effect.die("listOpenBySourceType not used in this test"),
      listByMonitorId: () => Effect.die("listByMonitorId not used in this test"),
      statsByMonitorId: () => Effect.die("statsByMonitorId not used in this test"),
      setEndedAt: () => Effect.die("setEndedAt not used in this test"),
      closeById: () => Effect.die("closeById not used in this test"),
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
    layer: Layer.mergeAll(IncidentRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

describe("createIncidentFromSignalEventUseCase", () => {
  it("inserts a signal incident row and writes IncidentCreated", async () => {
    const { events, inserted, layer } = createTestLayers()
    const occurredAt = new Date("2026-05-06T10:00:00Z")

    const incident = await Effect.runPromise(
      createIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        occurredAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      severity: "high",
      sourceType: "signal",
      sourceId: cuid("i"),
      startedAt: occurredAt,
      endedAt: null,
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
        sourceType: "signal",
        sourceId: cuid("i"),
      },
    })
  })

  it("leaves endedAt null so signal escalation lifecycle can be closed later", async () => {
    const { inserted, layer } = createTestLayers()
    const occurredAt = new Date("2026-05-06T12:00:00Z")

    await Effect.runPromise(
      createIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        occurredAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted[0]?.startedAt).toEqual(occurredAt)
    expect(inserted[0]?.endedAt).toBeNull()
  })

  it("defaults condition to null", async () => {
    const { inserted, layer } = createTestLayers()
    await Effect.runPromise(
      createIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        occurredAt: new Date("2026-05-06T10:00:00Z"),
      }).pipe(Effect.provide(layer)),
    )
    expect(inserted[0]?.condition).toBeNull()
  })

  it("stamps the condition snapshot", async () => {
    const { inserted, layer } = createTestLayers()
    await Effect.runPromise(
      createIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        occurredAt: new Date("2026-05-06T12:00:00Z"),
        condition: { trigger: "escalating", metric: { kind: "count" }, sensitivity: 4 },
      }).pipe(Effect.provide(layer)),
    )
    expect(inserted[0]?.condition).toEqual({ trigger: "escalating", metric: { kind: "count" }, sensitivity: 4 })
  })
})
