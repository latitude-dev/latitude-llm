import { createIssueCentroid, type Issue, IssueRepository, MIN_OCCURRENCES_FOR_VISIBILITY } from "@domain/issues"
import { IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IssueRepositoryLive } from "./issue-repository.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
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

const makeCustomScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly issueId: string
  readonly createdAt: Date
}): typeof scoresTable.$inferInsert => ({
  id: input.id,
  organizationId,
  projectId: input.projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "custom",
  sourceId: `source-${input.id}`,
  simulationId: null,
  issueId: input.issueId,
  value: 0.1,
  passed: false,
  feedback: `Feedback for ${input.id}`,
  metadata: { channel: "api" },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
})

const makeAnnotationScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly issueId: string
  readonly createdAt: Date
}): typeof scoresTable.$inferInsert => ({
  id: input.id,
  organizationId,
  projectId: input.projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "annotation",
  sourceId: "UI",
  simulationId: null,
  issueId: input.issueId,
  value: 0.1,
  passed: false,
  feedback: `Feedback for ${input.id}`,
  metadata: {
    rawFeedback: `Feedback for ${input.id}`,
  },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
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

  it("lists only visible issues scoped to project, newest-first, and paginates with hasMore", async () => {
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
      name: "Beta token mention",
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T09:00:00.000Z"),
    })
    const newest = makeIssue({
      id: IssueId("cccccccccccccccccccccccc"),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: listTestProjectId,
      name: "Most recent issue",
      createdAt: new Date("2026-03-30T11:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T11:00:00.000Z"),
    })
    const hiddenLowEvidence = makeIssue({
      id: IssueId("dddddddddddddddddddddddd"),
      uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      projectId: listTestProjectId,
      name: "Single weak occurrence",
      createdAt: new Date("2026-03-30T12:00:00.000Z"),
      updatedAt: new Date("2026-03-30T12:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T12:00:00.000Z"),
    })
    const wrongProject = makeIssue({
      id: IssueId("eeeeeeeeeeeeeeeeeeeeeeee"),
      uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      projectId: otherProjectId,
      name: "Wrong project issue",
      createdAt: new Date("2026-03-30T13:00:00.000Z"),
      updatedAt: new Date("2026-03-30T13:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T13:00:00.000Z"),
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(older)
        yield* repository.save(mid)
        yield* repository.save(newest)
        yield* repository.save(hiddenLowEvidence)
        yield* repository.save(wrongProject)
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    await database.db.insert(scoresTable).values([
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `oldcustomscore000000000${index + 1}`,
          projectId: listTestProjectId,
          issueId: older.id,
          createdAt: new Date("2026-03-30T08:30:00.000Z"),
        }),
      ),
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `newcustomscore000000000${index + 1}`,
          projectId: listTestProjectId,
          issueId: newest.id,
          createdAt: new Date("2026-03-30T11:30:00.000Z"),
        }),
      ),
      makeCustomScoreRow({
        id: "hiddenlowevidencecustom1",
        projectId: listTestProjectId,
        issueId: hiddenLowEvidence.id,
        createdAt: new Date("2026-03-30T12:30:00.000Z"),
      }),
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `wrongprojectscore000000${index + 1}`,
          projectId: otherProjectId,
          issueId: wrongProject.id,
          createdAt: new Date("2026-03-30T13:30:00.000Z"),
        }),
      ),
    ])
    await database.db.insert(scoresTable).values(
      makeAnnotationScoreRow({
        id: "midannotationevidence001",
        projectId: listTestProjectId,
        issueId: mid.id,
        createdAt: new Date("2026-03-30T09:30:00.000Z"),
      }),
    )

    const layer = withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))

    const page1 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: ProjectId(listTestProjectId),
          limit: 2,
          offset: 0,
        })
      }).pipe(layer),
    )

    expect(page1.items.map((issue) => issue.id)).toEqual([newest.id, mid.id])
    expect(page1.items.map((issue) => issue.id)).not.toContain(hiddenLowEvidence.id)
    expect(page1.hasMore).toBe(true)
    expect(page1.limit).toBe(2)
    expect(page1.offset).toBe(0)

    const page2 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: ProjectId(listTestProjectId),
          limit: 2,
          offset: 2,
        })
      }).pipe(layer),
    )

    expect(page2.items.map((issue) => issue.id)).toEqual([older.id])
    expect(page2.hasMore).toBe(false)
  })

  it("can lock an issue row by id inside a transaction", async () => {
    const issue = makeIssue()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(issue)
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const lockedIssue = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        const sqlClient = yield* SqlClient

        return yield* sqlClient.transaction(repository.findByIdForUpdate(issue.id))
      }).pipe(withPostgres(IssueRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(lockedIssue).toEqual(issue)
  })
})
