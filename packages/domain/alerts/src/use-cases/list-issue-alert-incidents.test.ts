import { IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertIncident } from "../entities/alert-incident.ts"
import type { ListAlertIncidentsByProjectInRangeInput } from "../ports/alert-incident-repository.ts"
import { AlertIncidentRepository, type AlertIncidentRepositoryShape } from "../ports/alert-incident-repository.ts"
import { listIssueAlertIncidentsUseCase } from "./list-issue-alert-incidents.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const organizationId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const issueId = IssueId(cuid("i"))

const makeIncident = (overrides: Partial<AlertIncident> = {}): AlertIncident =>
  ({
    id: cuid("a"),
    organizationId,
    projectId,
    sourceType: "issue",
    sourceId: issueId,
    kind: "issue.escalating",
    severity: "warning",
    startedAt: new Date("2026-04-01T00:00:00.000Z"),
    endedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    entrySignals: null,
    exitEligibleSince: null,
    ...overrides,
  }) as AlertIncident

const createRepository = (incidents: readonly AlertIncident[]) => {
  const calls: ListAlertIncidentsByProjectInRangeInput[] = []
  const repository: AlertIncidentRepositoryShape = {
    insert: () => Effect.die("Unexpected insert"),
    findById: () => Effect.die("Unexpected findById"),
    findOpen: () => Effect.die("Unexpected findOpen"),
    closeOpen: () => Effect.die("Unexpected closeOpen"),
    updateExitDwell: () => Effect.die("Unexpected updateExitDwell"),
    listByProjectInRange: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return incidents
      }),
    listOpenByKind: () => Effect.die("Unexpected listOpenByKind"),
  }
  return { repository, calls }
}

const buildLayer = (incidents: readonly AlertIncident[]) => {
  const { repository, calls } = createRepository(incidents)
  return {
    calls,
    layer: Layer.mergeAll(
      Layer.succeed(AlertIncidentRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    ),
  }
}

describe("listIssueAlertIncidentsUseCase", () => {
  it("queries the repository scoped to the issue with the explicit time range", async () => {
    const incident = makeIncident()
    const { calls, layer } = buildLayer([incident])

    const from = new Date("2026-04-01T00:00:00.000Z")
    const to = new Date("2026-04-08T00:00:00.000Z")

    const result = await Effect.runPromise(
      listIssueAlertIncidentsUseCase({ organizationId, projectId, issueId, from, to }).pipe(Effect.provide(layer)),
    )

    expect(result.items).toEqual([incident])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      organizationId,
      projectId,
      sourceType: "issue",
      sourceId: issueId,
      from,
      to,
    })
  })

  it("defaults to a trailing-14-day window when `from` is omitted", async () => {
    const { calls, layer } = buildLayer([])
    const now = new Date("2026-04-15T12:00:00.000Z")

    await Effect.runPromise(
      listIssueAlertIncidentsUseCase({ organizationId, projectId, issueId, now }).pipe(Effect.provide(layer)),
    )

    const expectedFrom = new Date(now)
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - 14)

    expect(calls[0]?.from).toEqual(expectedFrom)
    expect(calls[0]?.to).toEqual(now)
  })

  it("honors a custom `to` while still defaulting `from` 14 days before it", async () => {
    const { calls, layer } = buildLayer([])
    const to = new Date("2026-04-10T00:00:00.000Z")

    await Effect.runPromise(
      listIssueAlertIncidentsUseCase({ organizationId, projectId, issueId, to }).pipe(Effect.provide(layer)),
    )

    const expectedFrom = new Date(to)
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - 14)

    expect(calls[0]?.from).toEqual(expectedFrom)
    expect(calls[0]?.to).toEqual(to)
  })

  it("returns an empty `items` list when the repository has no matches", async () => {
    const { layer } = buildLayer([])

    const result = await Effect.runPromise(
      listIssueAlertIncidentsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.items).toEqual([])
  })
})
