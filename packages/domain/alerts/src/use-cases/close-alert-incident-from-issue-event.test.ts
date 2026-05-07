import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { CloseOpenAlertIncidentInput } from "../ports/alert-incident-repository.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"
import { closeAlertIncidentFromIssueEventUseCase } from "./close-alert-incident-from-issue-event.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function createTestLayers() {
  const closed: CloseOpenAlertIncidentInput[] = []

  const AlertIncidentRepositoryTest = Layer.succeed(
    AlertIncidentRepository,
    AlertIncidentRepository.of({
      insert: () => Effect.void,
      closeOpen: (input) =>
        Effect.sync(() => {
          closed.push(input)
        }),
    }),
  )

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid("o")) }))

  return {
    closed,
    layer: Layer.mergeAll(AlertIncidentRepositoryTest, SqlClientTest),
  }
}

describe("closeAlertIncidentFromIssueEventUseCase", () => {
  it("calls closeOpen with the issue source pointer and the provided endedAt", async () => {
    const { closed, layer } = createTestLayers()
    const endedAt = new Date("2026-05-07T10:00:00Z")

    await Effect.runPromise(
      closeAlertIncidentFromIssueEventUseCase({
        kind: "issue.escalating",
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
  })
})
