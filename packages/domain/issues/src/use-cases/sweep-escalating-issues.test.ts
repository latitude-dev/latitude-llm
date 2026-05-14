import { type AlertIncident, AlertIncidentRepository, type AlertIncidentRepositoryShape } from "@domain/alerts"
import { QueuePublishError } from "@domain/queue"
import {
  AlertIncidentId,
  OrganizationId,
  ProjectId as ProjectIdValue,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { sweepEscalatingIssuesUseCase } from "./sweep-escalating-issues.ts"

const makeIncident = (idx: number, overrides: Partial<AlertIncident> = {}): AlertIncident => ({
  id: AlertIncidentId(`a${idx}`.padEnd(24, "a")),
  organizationId: OrganizationId(`o${idx}`.padEnd(24, "o")),
  projectId: ProjectIdValue(`p${idx}`.padEnd(24, "p")),
  sourceType: "issue",
  sourceId: `i${idx}`.padEnd(24, "i"),
  kind: "issue.escalating",
  severity: "high",
  startedAt: new Date("2026-05-07T10:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-05-07T10:00:00.000Z"),
  entrySignals: null,
  exitEligibleSince: null,
  ...overrides,
})

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

interface CapturedPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
}

const provideRepository = (incidents: readonly AlertIncident[]): AlertIncidentRepositoryShape => ({
  insert: () => Effect.die("insert not used"),
  findById: () => Effect.die("findById not used"),
  findOpen: () => Effect.die("findOpen not used"),
  closeOpen: () => Effect.die("closeOpen not used"),
  updateExitDwell: () => Effect.die("updateExitDwell not used"),
  listByProjectInRange: () => Effect.die("listByProjectInRange not used"),
  listOpenByKind: (kind) =>
    kind === "issue.escalating" ? Effect.succeed(incidents) : Effect.die(`unexpected kind ${kind}`),
})

const runSweep = (
  incidents: readonly AlertIncident[],
  publishImpl: (payload: CapturedPayload) => Effect.Effect<void, QueuePublishError> = () => Effect.void,
) => {
  const captured: CapturedPayload[] = []
  const publish = (payload: CapturedPayload) => {
    captured.push(payload)
    return publishImpl(payload)
  }
  const program = sweepEscalatingIssuesUseCase({ publish }).pipe(
    Effect.provideService(AlertIncidentRepository, provideRepository(incidents)),
    Effect.provideService(SqlClient, createPassthroughSqlClient("system".padEnd(24, "s"))),
  )
  return Effect.runPromise(program).then((result) => ({ result, captured }))
}

describe("sweepEscalatingIssuesUseCase", () => {
  it("publishes one checkEscalation per open escalating incident", async () => {
    const incidents = [makeIncident(1), makeIncident(2), makeIncident(3)]

    const { result, captured } = await runSweep(incidents)

    expect(result).toEqual({ attempted: 3, published: 3, failed: 0 })
    expect(captured).toEqual(
      incidents.map((i) => ({
        organizationId: i.organizationId,
        projectId: i.projectId,
        issueId: i.sourceId,
      })),
    )
  })

  it("returns zero counts when no incidents are open", async () => {
    const { result, captured } = await runSweep([])

    expect(result).toEqual({ attempted: 0, published: 0, failed: 0 })
    expect(captured).toHaveLength(0)
  })

  it("tallies per-publish failures into `failed` without aborting the sweep", async () => {
    const incidents = [makeIncident(1), makeIncident(2), makeIncident(3)]

    const { result, captured } = await runSweep(incidents, (payload) =>
      payload.issueId.startsWith("i2")
        ? Effect.fail(new QueuePublishError({ cause: new Error("boom"), queue: "issues" }))
        : Effect.void,
    )

    expect(captured).toHaveLength(3)
    expect(result).toEqual({ attempted: 3, published: 2, failed: 1 })
  })
})
