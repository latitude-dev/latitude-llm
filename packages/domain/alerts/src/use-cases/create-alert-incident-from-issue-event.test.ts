import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, SqlClient } from "@domain/shared"
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
      closeOpen: () => Effect.void,
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
        kind: "issue.new",
        sourceType: "issue",
        sourceId: cuid("i"),
      },
    })
  })

  it("uses high severity for issue.regressed", async () => {
    const { inserted, layer } = createTestLayers()

    await Effect.runPromise(
      createAlertIncidentFromIssueEventUseCase({
        kind: "issue.regressed",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        occurredAt: new Date(),
      }).pipe(Effect.provide(layer)),
    )

    expect(inserted[0]?.severity).toBe("high")
    expect(inserted[0]?.kind).toBe("issue.regressed")
  })
})
