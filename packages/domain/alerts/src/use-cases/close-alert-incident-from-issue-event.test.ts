import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { AlertIncidentId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { CloseOpenAlertIncidentInput } from "../ports/alert-incident-repository.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"
import { closeAlertIncidentFromIssueEventUseCase } from "./close-alert-incident-from-issue-event.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function createTestLayers(opts: { closedId: string | null }) {
  const closed: CloseOpenAlertIncidentInput[] = []
  const events: OutboxWriteEvent[] = []

  const AlertIncidentRepositoryTest = Layer.succeed(
    AlertIncidentRepository,
    AlertIncidentRepository.of({
      insert: () => Effect.die("insert not used in this test"),
      findById: () => Effect.die("findById not used in this test"),
      findOpen: () => Effect.succeed(null),
      closeOpen: (input) =>
        Effect.sync(() => {
          closed.push(input)
          return opts.closedId !== null ? AlertIncidentId(opts.closedId) : null
        }),
      updateExitDwell: () => Effect.void,
      listByProjectInRange: () => Effect.die("listByProjectInRange not used in this test"),
      listOpenByKind: () => Effect.die("listOpenByKind not used in this test"),
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
    layer: Layer.mergeAll(AlertIncidentRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

describe("closeAlertIncidentFromIssueEventUseCase", () => {
  it("calls closeOpen with the issue source pointer and emits IncidentClosed with the closed id", async () => {
    const { closed, events, layer } = createTestLayers({ closedId: cuid("c") })
    const endedAt = new Date("2026-05-07T10:00:00Z")

    await Effect.runPromise(
      closeAlertIncidentFromIssueEventUseCase({
        kind: "issue.escalating",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        endedAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(closed).toHaveLength(1)
    expect(closed[0]).toEqual({
      sourceType: "issue",
      sourceId: cuid("i"),
      kind: "issue.escalating",
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
        kind: "issue.escalating",
        sourceType: "issue",
        sourceId: cuid("i"),
      },
    })
  })

  it("does not emit IncidentClosed when no open incident exists", async () => {
    const { closed, events, layer } = createTestLayers({ closedId: null })

    await Effect.runPromise(
      closeAlertIncidentFromIssueEventUseCase({
        kind: "issue.escalating",
        organizationId: cuid("o"),
        projectId: cuid("p"),
        issueId: cuid("i"),
        endedAt: new Date("2026-05-07T10:00:00Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(closed).toHaveLength(1)
    expect(events).toHaveLength(0)
  })
})
