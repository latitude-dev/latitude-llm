import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { AlertIncidentId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { CloseOpenIncidentInput } from "../ports/incident-repository.ts"
import { IncidentRepository } from "../ports/incident-repository.ts"
import { closeIncidentFromSignalEventUseCase } from "./close-incident-from-signal-event.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function createTestLayers(opts: { closedId: string | null }) {
  const closed: CloseOpenIncidentInput[] = []
  const events: OutboxWriteEvent[] = []

  const IncidentRepositoryTest = Layer.succeed(
    IncidentRepository,
    IncidentRepository.of({
      insert: () => Effect.die("insert not used in this test"),
      findById: () => Effect.die("findById not used in this test"),
      findOpen: () => Effect.succeed(null),
      closeOpen: (input) =>
        Effect.sync(() => {
          closed.push(input)
          return opts.closedId !== null ? AlertIncidentId(opts.closedId) : null
        }),
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
    closed,
    events,
    layer: Layer.mergeAll(IncidentRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

describe("closeIncidentFromSignalEventUseCase", () => {
  it("calls closeOpen with the signal source pointer and emits IncidentClosed with the closed id", async () => {
    const { closed, events, layer } = createTestLayers({ closedId: cuid("c") })
    const endedAt = new Date("2026-05-07T10:00:00Z")

    await Effect.runPromise(
      closeIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        endedAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(closed).toHaveLength(1)
    expect(closed[0]).toEqual({
      sourceType: "signal",
      sourceId: cuid("i"),
      endedAt,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IncidentClosed",
      aggregateType: "alert_incident",
      aggregateId: cuid("c"),
      organizationId: cuid("o"),
      payload: {
        organizationId: cuid("o"),
        projectId: cuid("p"),
        alertIncidentId: cuid("c"),
        sourceType: "signal",
        sourceId: cuid("i"),
      },
    })
  })

  it("does not emit IncidentClosed when no open incident exists", async () => {
    const { closed, events, layer } = createTestLayers({ closedId: null })

    await Effect.runPromise(
      closeIncidentFromSignalEventUseCase({
        organizationId: cuid("o"),
        projectId: cuid("p"),
        signalId: cuid("i"),
        endedAt: new Date("2026-05-07T10:00:00Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(closed).toHaveLength(1)
    expect(events).toHaveLength(0)
  })
})
