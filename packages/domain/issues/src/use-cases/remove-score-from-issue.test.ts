import { createFakeAI } from "@domain/ai/testing"
import { IssueId, OrganizationId, SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid, updateIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository, createFakeIssueRepository } from "../testing/index.ts"
import { removeScoreFromIssueUseCase } from "./remove-score-from-issue.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const issueId = IssueId("iiiiiiiiiiiiiiiiiiiiiiii")

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 0.6
    if (index === 1) return 0.8
    return 0
  })

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: issueId,
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = () =>
  Layer.succeed(SqlClient, {
    organizationId: OrganizationId(organizationId),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  })

describe("removeScoreFromIssueUseCase", () => {
  it("returns skipped with reason 'draft' when draftedAt is not null", async () => {
    const result = await Effect.runPromise(
      removeScoreFromIssueUseCase({
        organizationId,
        projectId,
        issueId,
        draftedAt: new Date("2026-03-30T10:00:00.000Z"),
        feedback: "Some feedback",
        source: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "draft" })
  })

  it("returns skipped with reason 'not-linked' when issueId is null", async () => {
    const result = await Effect.runPromise(
      removeScoreFromIssueUseCase({
        organizationId,
        projectId,
        issueId: null,
        draftedAt: null,
        feedback: "Some feedback",
        source: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "not-linked" })
  })

  it("returns issue-not-found when the issue does not exist", async () => {
    const { repository: issueRepository } = createFakeIssueRepository()
    const { service: issueProjectionRepository } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding: makeEmbedding() }) })

    const layer = Layer.mergeAll(
      Layer.succeed(IssueRepository, issueRepository),
      Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    const result = await Effect.runPromise(
      removeScoreFromIssueUseCase({
        organizationId,
        projectId,
        issueId,
        draftedAt: null,
        feedback: "The assistant leaks API tokens.",
        source: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "issue-not-found" })
  })

  it("removes score contribution from issue centroid and syncs projection", async () => {
    const scoreCreatedAt = new Date("2026-03-30T10:00:00.000Z")
    const embedding = makeEmbedding()

    const issueWithCentroid = makeIssue({
      centroid: updateIssueCentroid({
        centroid: {
          ...createIssueCentroid(),
          clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
        },
        score: {
          embedding,
          source: "annotation",
          createdAt: scoreCreatedAt,
        },
        operation: "add",
        timestamp: new Date("2026-03-30T10:00:00.000Z"),
      }),
    })

    const { repository: issueRepository, issues } = createFakeIssueRepository()
    issues.set(issueWithCentroid.id, issueWithCentroid)

    const { service: issueProjectionRepository, store: projectionStore } = createFakeIssueProjectionRepository({
      organizationId,
    })

    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding }) })

    const layer = Layer.mergeAll(
      Layer.succeed(IssueRepository, issueRepository),
      Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    expect(issueWithCentroid.centroid.mass).toBeGreaterThan(0)

    const result = await Effect.runPromise(
      removeScoreFromIssueUseCase({
        organizationId,
        projectId,
        issueId,
        draftedAt: null,
        feedback: "The assistant leaks API tokens.",
        source: "annotation",
        createdAt: scoreCreatedAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "removed" })
    expect(fakeAi.calls.embed).toHaveLength(1)

    const updatedIssue = issues.get(issueId)
    expect(updatedIssue?.centroid.mass).toBe(0)

    expect(projectionStore.size).toBe(0)
  })

  it("updates projection with normalized centroid when mass remains positive", async () => {
    const scoreCreatedAt1 = new Date("2026-03-30T08:00:00.000Z")
    const scoreCreatedAt2 = new Date("2026-03-30T10:00:00.000Z")
    const embedding1 = makeEmbedding()
    const embedding2 = Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, i) => (i === 2 ? 1 : 0))

    let centroid = updateIssueCentroid({
      centroid: { ...createIssueCentroid(), clusteredAt: new Date("2026-03-29T10:00:00.000Z") },
      score: { embedding: embedding1, source: "annotation", createdAt: scoreCreatedAt1 },
      operation: "add",
      timestamp: scoreCreatedAt1,
    })
    centroid = updateIssueCentroid({
      centroid,
      score: { embedding: embedding2, source: "annotation", createdAt: scoreCreatedAt2 },
      operation: "add",
      timestamp: scoreCreatedAt2,
    })

    const issueWithTwoScores = makeIssue({ centroid })
    const { repository: issueRepository, issues } = createFakeIssueRepository()
    issues.set(issueWithTwoScores.id, issueWithTwoScores)

    const { service: issueProjectionRepository, store: projectionStore } = createFakeIssueProjectionRepository({
      organizationId,
    })

    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding: embedding1 }) })

    const layer = Layer.mergeAll(
      Layer.succeed(IssueRepository, issueRepository),
      Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    const result = await Effect.runPromise(
      removeScoreFromIssueUseCase({
        organizationId,
        projectId,
        issueId,
        draftedAt: null,
        feedback: "First feedback",
        source: "annotation",
        createdAt: scoreCreatedAt1,
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "removed" })

    const updatedIssue = issues.get(issueId)
    expect(updatedIssue?.centroid.mass).toBeGreaterThan(0)

    expect(projectionStore.size).toBe(1)
  })
})
