import { createIssueCentroid, type Issue, IssueRepository } from "@domain/issues"
import { IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IssueRepositoryLive } from "./issue-repository.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
/** Isolated project for `list` tests so other cases in this file do not affect row counts or ordering. */
const listTestProjectId = "rrrrrrrrrrrrrrrrrrrrrrrr"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
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
  ...overrides,
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

  it("lists issues scoped to project, newest-first, paginates with hasMore, and filters names with ilike", async () => {
    const older = makeIssue({
      id: IssueId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectId: listTestProjectId,
      name: "Zebra ordering",
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T08:00:00.000Z"),
    })
    const mid = makeIssue({
      id: IssueId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectId: listTestProjectId,
      name: "Beta Token mention",
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T09:00:00.000Z"),
    })
    const newest = makeIssue({
      id: IssueId("cccccccccccccccccccccccc"),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: listTestProjectId,
      name: "Nothing like filter",
      createdAt: new Date("2026-03-30T11:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T11:00:00.000Z"),
    })
    const wrongProject = makeIssue({
      id: IssueId("dddddddddddddddddddddddd"),
      uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      projectId: otherProjectId,
      name: "Wrong project TOKEN",
      createdAt: new Date("2026-03-30T12:00:00.000Z"),
      updatedAt: new Date("2026-03-30T12:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T12:00:00.000Z"),
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(older)
        yield* repository.save(mid)
        yield* repository.save(newest)
        yield* repository.save(wrongProject)
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const layer = withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))

    const page1 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: listTestProjectId,
          limit: 2,
          offset: 0,
        })
      }).pipe(layer),
    )

    expect(page1.items.map((i) => i.id)).toEqual([newest.id, mid.id])
    expect(page1.hasMore).toBe(true)
    expect(page1.limit).toBe(2)
    expect(page1.offset).toBe(0)

    const page2 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: listTestProjectId,
          limit: 2,
          offset: 2,
        })
      }).pipe(layer),
    )

    expect(page2.items.map((i) => i.id)).toEqual([older.id])
    expect(page2.hasMore).toBe(false)

    const filtered = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: listTestProjectId,
          limit: 10,
          offset: 0,
          nameFilter: "token",
        })
      }).pipe(layer),
    )

    expect(filtered.items).toHaveLength(1)
    expect(filtered.items[0]?.id).toBe(mid.id)
    expect(filtered.hasMore).toBe(false)
  })
})
