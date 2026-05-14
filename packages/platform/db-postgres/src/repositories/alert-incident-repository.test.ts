import { type AlertIncident, AlertIncidentRepository } from "@domain/alerts"
import { AlertIncidentId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertIncidents as alertIncidentsTable } from "../schema/alert-incidents.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AlertIncidentRepositoryLive } from "./alert-incident-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("p".repeat(24))
const projectId = ProjectId("a".repeat(24))

const baseFields = {
  organizationId: organizationId as string,
  projectId: projectId as string,
  sourceType: "issue" as const,
  severity: "high" as const,
  entrySignals: null,
  exitEligibleSince: null,
}

const makeRow = (
  overrides: Partial<typeof alertIncidentsTable.$inferInsert>,
): typeof alertIncidentsTable.$inferInsert => ({
  ...baseFields,
  id: AlertIncidentId("a".repeat(24)),
  sourceId: "i".repeat(24),
  kind: "issue.escalating",
  startedAt: new Date("2026-05-07T10:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-05-07T10:00:00.000Z"),
  ...overrides,
})

// Admin client — `listOpenByKind` deliberately reads across orgs (sweep job)
// so RLS is bypassed. Matches the production wiring in `issues.ts`.
const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(AlertIncidentRepositoryLive, database.adminPostgresClient)

describe("AlertIncidentRepositoryLive.listOpenByKind", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("returns only open rows matching the kind, across organizations, ordered by startedAt asc", async () => {
    const openA = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      startedAt: new Date("2026-05-07T10:00:00.000Z"),
    })
    const openB = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      organizationId: otherOrganizationId,
      startedAt: new Date("2026-05-07T11:00:00.000Z"),
    })
    const closedC = makeRow({
      id: AlertIncidentId("3".repeat(24)),
      sourceId: "3".repeat(24),
      endedAt: new Date("2026-05-07T12:00:00.000Z"),
    })
    const otherKindD = makeRow({
      id: AlertIncidentId("4".repeat(24)),
      sourceId: "4".repeat(24),
      kind: "issue.regressed",
    })

    await database.db.insert(alertIncidentsTable).values([openA, openB, closedC, otherKindD])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listOpenByKind("issue.escalating")
      }).pipe(makeProvider(database)),
    )

    const ids = result.map((r: AlertIncident) => r.id)
    expect(ids).toEqual([AlertIncidentId("1".repeat(24)), AlertIncidentId("2".repeat(24))])
  })

  it("returns an empty list when no incidents match", async () => {
    await database.db.insert(alertIncidentsTable).values([
      makeRow({
        id: AlertIncidentId("5".repeat(24)),
        sourceId: "5".repeat(24),
        endedAt: new Date("2026-05-07T12:00:00.000Z"),
      }),
    ])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listOpenByKind("issue.escalating")
      }).pipe(makeProvider(database)),
    )

    expect(result).toEqual([])
  })
})
