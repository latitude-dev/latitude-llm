import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { AlertIncidentId, NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertIncident } from "../entities/alert-incident.ts"
import type { SetAlertIncidentEndedAtInput } from "../ports/alert-incident-repository.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"
import { resolveAlertIncidentUseCase } from "./resolve-alert-incident.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const incident = (overrides?: Partial<AlertIncident>): AlertIncident => ({
  id: AlertIncidentId(cuid("a")),
  organizationId: OrganizationId(cuid("o")),
  projectId: ProjectId(cuid("p")),
  sourceType: "issue",
  sourceId: cuid("i"),
  kind: "issue.escalating",
  severity: "high",
  startedAt: new Date("2026-06-01T00:00:00Z"),
  endedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  entrySignals: null,
  exitEligibleSince: null,
  monitorAlertId: null,
  condition: null,
  ...overrides,
})

function createTestLayers(opts: { closeResult: AlertIncident | null; stored?: AlertIncident }) {
  const closeCalls: SetAlertIncidentEndedAtInput[] = []
  const events: OutboxWriteEvent[] = []

  const AlertIncidentRepositoryTest = Layer.succeed(
    AlertIncidentRepository,
    AlertIncidentRepository.of({
      insert: () => Effect.die("insert not used in this test"),
      findById: (id) =>
        opts.stored ? Effect.succeed(opts.stored) : Effect.fail(new NotFoundError({ entity: "AlertIncident", id })),
      findOpen: () => Effect.die("findOpen not used in this test"),
      closeOpen: () => Effect.die("closeOpen not used in this test"),
      updateExitDwell: () => Effect.die("updateExitDwell not used in this test"),
      listByProjectId: () => Effect.die("listByProjectId not used in this test"),
      listOpenByKind: () => Effect.die("listOpenByKind not used in this test"),
      listByMonitorId: () => Effect.die("listByMonitorId not used in this test"),
      statsByMonitorId: () => Effect.die("statsByMonitorId not used in this test"),
      listByMonitorAlertId: () => Effect.die("listByMonitorAlertId not used in this test"),
      findOpenByMonitorAlertId: () => Effect.die("findOpenByMonitorAlertId not used in this test"),
      existsByMonitorAlertId: () => Effect.die("existsByMonitorAlertId not used in this test"),
      setEndedAt: () => Effect.die("setEndedAt not used in this test"),
      closeById: (input) =>
        Effect.sync(() => {
          closeCalls.push(input)
          return opts.closeResult
        }),
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
    closeCalls,
    events,
    layer: Layer.mergeAll(AlertIncidentRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

describe("resolveAlertIncidentUseCase", () => {
  it("closes the open incident and emits IncidentClosed with reason resolved", async () => {
    const endedAt = new Date("2026-06-12T10:00:00Z")
    const closed = incident({ endedAt })
    const { closeCalls, events, layer } = createTestLayers({ closeResult: closed })

    const result = await Effect.runPromise(
      resolveAlertIncidentUseCase({ id: closed.id, endedAt }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual(closed)
    expect(closeCalls).toEqual([{ id: closed.id, endedAt }])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IncidentClosed",
      aggregateType: "alert_incident",
      aggregateId: closed.id,
      organizationId: closed.organizationId,
      payload: {
        organizationId: closed.organizationId,
        projectId: closed.projectId,
        alertIncidentId: closed.id,
        kind: "issue.escalating",
        sourceType: "issue",
        sourceId: closed.sourceId,
        reason: "resolved",
      },
    })
  })

  it("returns the stored incident without emitting when it is already closed", async () => {
    const stored = incident({ endedAt: new Date("2026-06-10T00:00:00Z") })
    const { events, layer } = createTestLayers({ closeResult: null, stored })

    const result = await Effect.runPromise(
      resolveAlertIncidentUseCase({ id: stored.id, endedAt: new Date("2026-06-12T10:00:00Z") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result).toEqual(stored)
    expect(events).toHaveLength(0)
  })

  it("fails with NotFoundError when the incident does not exist", async () => {
    const { events, layer } = createTestLayers({ closeResult: null })

    const exit = await Effect.runPromiseExit(
      resolveAlertIncidentUseCase({ id: AlertIncidentId(cuid("x")), endedAt: new Date("2026-06-12T10:00:00Z") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(events).toHaveLength(0)
  })
})
