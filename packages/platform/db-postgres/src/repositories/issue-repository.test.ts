import {
  createIssueCentroid,
  type Issue,
  IssueRepository,
  issueSchema,
  MIN_OCCURRENCES_FOR_VISIBILITY,
} from "@domain/issues"
import { IssueId, NotFoundError, OrganizationId, ProjectId, SqlClient, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertIncidents as alertIncidentsTable } from "../schema/alert-incidents.ts"
import { issues as issuesTable } from "../schema/issues.ts"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IssueRepositoryLive } from "./issue-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const listTestProjectId = "r".repeat(24)
const otherProjectId = ProjectId("q".repeat(24))
const issueId = IssueId("i".repeat(24))
const otherIssueId = IssueId("j".repeat(24))

const issueBase = {
  organizationId: organizationId as string,
  projectId: projectId as string,
  source: "annotation" as const,
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
}

const makeIssue = (overrides: Partial<Issue> = {}): Issue => {
  const name = overrides.name ?? "Secret leakage"
  return issueSchema.parse({
    id: issueId,
    uuid: "11111111-1111-4111-8111-111111111111",
    slug: toSlug(name),
    name,
    description: "The agent exposes sensitive secrets.",
    ...issueBase,
    ...overrides,
  })
}

const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(IssueRepositoryLive, database.appPostgresClient, organizationId)

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

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
    await database.db.delete(scoresTable)
    await database.db.delete(issuesTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("persists and reads canonical issues", async () => {
    const canonicalIssue = makeIssue()
    const otherIssue = makeIssue({
      id: otherIssueId,
      uuid: "22222222-2222-4222-8222-222222222222",
      name: "Incorrect refusal",
      description: "The agent refuses valid requests.",
      projectId: otherProjectId as string,
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(canonicalIssue)
        yield* repository.save(otherIssue)

        const found = yield* repository.findById(canonicalIssue.id)

        expect(found.name).toBe(canonicalIssue.name)
      }).pipe(makeProvider(database)),
    )
  })

  it("persists and reads flagger-sourced issues", async () => {
    const flaggerIssue = makeIssue({
      source: "flagger",
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(flaggerIssue)

        const found = yield* repository.findById(flaggerIssue.id)

        expect(found.source).toBe("flagger")
      }).pipe(makeProvider(database)),
    )
  })

  it("returns NotFoundError when an issue does not exist", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          return yield* repository.findById(IssueId("z".repeat(24)))
        }).pipe(makeProvider(database)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("finds canonical issues by id within the requested project", async () => {
    const firstIssue = makeIssue()
    const secondIssue = makeIssue({
      id: IssueId("k".repeat(24)),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
      name: "Second canonical issue",
    })
    const otherProjectIssue = makeIssue({
      id: IssueId("l".repeat(24)),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
      projectId: otherProjectId as string,
      name: "Other project issue",
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        yield* repository.save(firstIssue)
        yield* repository.save(secondIssue)
        yield* repository.save(otherProjectIssue)
      }).pipe(makeProvider(database)),
    )

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.findByIds({
          projectId,
          issueIds: [firstIssue.id, secondIssue.id, otherProjectIssue.id],
        })
      }).pipe(makeProvider(database)),
    )

    expect(items.map((item) => item.id).sort()).toEqual([firstIssue.id, secondIssue.id].sort())
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
      }).pipe(makeProvider(database)),
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
    const page1 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IssueRepository
        return yield* repository.list({
          projectId: ProjectId(listTestProjectId),
          limit: 2,
          offset: 0,
        })
      }).pipe(makeProvider(database)),
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
      }).pipe(makeProvider(database)),
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

  describe("lifecycle JOIN", () => {
    it("findById attaches isEscalating=true when an open issue.escalating row exists", async () => {
      const issue = makeIssue()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-esc-open-aaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: null,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isEscalating).toBe(true)
      expect(result.lifecycle.isRegressed).toBe(false)
    })

    it("findById attaches isEscalating=false when the escalating row is closed", async () => {
      const issue = makeIssue()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-esc-clos-aaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: new Date("2026-04-16T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isEscalating).toBe(false)
    })

    it("findById attaches isRegressed=true when any issue.regressed row exists", async () => {
      const issue = makeIssue()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-reg-row-aaaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.regressed",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: null,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isRegressed).toBe(true)
    })

    it("list and findByIds populate the same lifecycle flags as findById", async () => {
      const escalatingIssue = makeIssue()
      const regressedIssue = makeIssue({
        id: otherIssueId,
        uuid: "22222222-2222-4222-8222-222222222222",
        name: "Incorrect refusal",
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          yield* repository.save(escalatingIssue)
          yield* repository.save(regressedIssue)
        }).pipe(makeProvider(database)),
      )

      // Add three annotation scores to each issue so they pass the
      // visibility threshold in `list`.
      const baseDate = new Date("2026-04-15T00:00:00.000Z")
      for (const target of [escalatingIssue, regressedIssue]) {
        for (let index = 0; index < 3; index++) {
          await database.db.insert(scoresTable).values(
            makeAnnotationScoreRow({
              id: `${target.id.slice(0, 6)}score${index}`.padEnd(24, "x"),
              projectId: target.projectId,
              issueId: target.id,
              createdAt: baseDate,
            }),
          )
        }
      }

      await database.db.insert(alertIncidentsTable).values([
        {
          id: "ai-esc-list-aaaaaaaaaaaa",
          organizationId,
          projectId: escalatingIssue.projectId,
          sourceType: "issue",
          sourceId: escalatingIssue.id,
          kind: "issue.escalating",
          severity: "high",
          startedAt: baseDate,
          endedAt: null,
        },
        {
          id: "ai-reg-list-aaaaaaaaaaaa",
          organizationId,
          projectId: regressedIssue.projectId,
          sourceType: "issue",
          sourceId: regressedIssue.id,
          kind: "issue.regressed",
          severity: "high",
          startedAt: baseDate,
          endedAt: null,
        },
      ])

      const { listResult, findByIdsResult } = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IssueRepository
          const listResult = yield* repository.list({ projectId, limit: 50, offset: 0 })
          const findByIdsResult = yield* repository.findByIds({
            projectId,
            issueIds: [escalatingIssue.id, regressedIssue.id],
          })
          return { listResult, findByIdsResult }
        }).pipe(makeProvider(database)),
      )

      const listFlags = new Map(listResult.items.map((item) => [item.id, item.lifecycle] as const))
      expect(listFlags.get(escalatingIssue.id)).toEqual({ isEscalating: true, isRegressed: false })
      expect(listFlags.get(regressedIssue.id)).toEqual({ isEscalating: false, isRegressed: true })

      const findByIdsFlags = new Map(findByIdsResult.map((item) => [item.id, item.lifecycle] as const))
      expect(findByIdsFlags.get(escalatingIssue.id)).toEqual({ isEscalating: true, isRegressed: false })
      expect(findByIdsFlags.get(regressedIssue.id)).toEqual({ isEscalating: false, isRegressed: true })
    })
  })
})
