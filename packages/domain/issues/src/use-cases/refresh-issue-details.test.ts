import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, NotFoundError, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository, createFakeIssueRepository } from "../testing/index.ts"
import { refreshIssueDetailsUseCase } from "./refresh-issue-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Current issue title",
  description: "Current issue description",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-31T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-31T10:00:00.000Z"),
  updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  ...overrides,
})

const makeScore = (feedback: string) =>
  scoreSchema.parse({
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
    value: 0.1,
    passed: false,
    feedback,
    metadata: { rawFeedback: feedback },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-31T10:00:00.000Z"),
    updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  })

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const createGenerateIssueDetails =
  (name: string, description: string): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({
      object: input.schema.parse({
        name,
        description,
      }),
      tokens: 10,
      duration: 5,
    })

describe("refreshIssueDetailsUseCase", () => {
  it("updates the canonical issue details while preserving the latest locked issue state", async () => {
    const initialIssue = makeIssue()
    const lockedIssue = makeIssue({
      centroid: {
        ...createIssueCentroid(),
        base: [0.6, 0.8],
        mass: 1,
      },
      clusteredAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    const lockCalls: string[] = []
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateIssueDetails("Refreshed issue title", "Refreshed issue description"),
    })
    const { repository: issueRepository, issues } = createFakeIssueRepository([initialIssue], {
      findByIdForUpdate: (id) => {
        lockCalls.push(id)
        return Effect.succeed(lockedIssue)
      },
    })
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listByIssueId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })

    const result = await Effect.runPromise(
      refreshIssueDetailsUseCase({
        organizationId,
        projectId,
        issueId: initialIssue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    const savedIssue = issues.get(initialIssue.id)

    expect(result).toEqual({
      action: "updated",
      issueId: initialIssue.id,
    })
    expect(lockCalls).toEqual([initialIssue.id])
    expect(savedIssue?.name).toBe("Refreshed issue title")
    expect(savedIssue?.description).toBe("Refreshed issue description")
    expect(savedIssue?.centroid).toEqual(lockedIssue.centroid)
    expect(savedIssue?.clusteredAt).toEqual(lockedIssue.clusteredAt)
    expect(savedIssue?.updatedAt.getTime()).toBeGreaterThan(lockedIssue.updatedAt.getTime())
    expect(store.size).toBe(1)
    expect(Array.from(store.values())[0]).toEqual(
      expect.objectContaining({
        uuid: lockedIssue.uuid,
        title: "Refreshed issue title",
        description: "Refreshed issue description",
        organizationId,
        projectId,
      }),
    )
  })

  it("returns unchanged without saving when the generated details already match the locked row", async () => {
    const issue = makeIssue({
      name: "Stable issue title",
      description: "Stable issue description",
    })
    let saveCalls = 0
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateIssueDetails("Stable issue title", "Stable issue description"),
    })
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const { repository: issueRepository } = createFakeIssueRepository([issue], {
      save: () =>
        Effect.sync(() => {
          saveCalls += 1
        }),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listByIssueId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })

    const result = await Effect.runPromise(
      refreshIssueDetailsUseCase({
        organizationId,
        projectId,
        issueId: issue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "unchanged",
      issueId: issue.id,
    })
    expect(saveCalls).toBe(0)
    expect(store.size).toBe(0)
  })

  it("returns not-found when the issue disappears before the locked save step", async () => {
    const existingIssue = makeIssue()
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateIssueDetails("Refreshed issue title", "Refreshed issue description"),
    })
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue], {
      findByIdForUpdate: () => Effect.fail(new NotFoundError({ entity: "Issue", id: existingIssue.id })),
    })
    const { repository: scoreRepository } = createFakeScoreRepository({
      listByIssueId: () =>
        Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: 25,
          offset: 0,
        }),
    })

    const result = await Effect.runPromise(
      refreshIssueDetailsUseCase({
        organizationId,
        projectId,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "not-found",
      issueId: existingIssue.id,
    })
    expect(calls.generate).toHaveLength(1)
    expect(store.size).toBe(0)
  })
})
