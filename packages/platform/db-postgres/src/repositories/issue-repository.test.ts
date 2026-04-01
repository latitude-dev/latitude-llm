import { createIssueCentroid, type Issue, IssueRepository } from "@domain/issues"
import { IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IssueRepositoryLive } from "./issue-repository.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeIssue = (): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage",
  description: "The assistant leaks API tokens in its response.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-30T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-30T10:00:00.000Z"),
  updatedAt: new Date("2026-03-30T10:00:00.000Z"),
})

describe("IssueRepositoryLive", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("round-trips issue rows by id and uuid", async () => {
    const issue = makeIssue()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(issue)
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const loadedById = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.findById(issue.id)
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const loadedByUuid = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.findByUuid({
          projectId: ProjectId(issue.projectId),
          uuid: issue.uuid,
        })
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(loadedById).toEqual(issue)
    expect(loadedByUuid).toEqual(issue)
  })
})
