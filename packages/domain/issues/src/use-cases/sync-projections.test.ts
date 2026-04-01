import { IssueId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid, updateIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository } from "../testing/fake-issue-projection-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 3
    if (index === 1) return 4
    return 0
  })

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage",
  description: "The assistant leaks API tokens in its response.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

describe("syncIssueProjectionsUseCase", () => {
  it("upserts the normalized centroid projection for a live issue", async () => {
    const withEvidence = makeIssue({
      centroid: updateIssueCentroid({
        centroid: {
          ...createIssueCentroid(),
          clusteredAt: new Date("2026-03-30T10:00:00.000Z"),
        },
        score: {
          embedding: makeEmbedding(),
          source: "annotation",
          createdAt: new Date("2026-03-30T10:00:00.000Z"),
        },
        operation: "add",
        timestamp: new Date("2026-03-30T10:00:00.000Z"),
      }),
      clusteredAt: new Date("2026-03-30T10:00:00.000Z"),
    })
    const { repository: issueRepository } = createFakeIssueRepository([withEvidence])
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository()

    await Effect.runPromise(
      syncIssueProjectionsUseCase({
        organizationId,
        issueId: withEvidence.id,
      }).pipe(
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
      ),
    )

    const projection = store.get(`${organizationId}_${projectId}::${withEvidence.uuid}`)
    expect(projection).toBeDefined()
    expect(projection?.title).toBe(withEvidence.name)
    expect(projection?.description).toBe(withEvidence.description)
    expect(projection?.vector.length).toBe(CENTROID_EMBEDDING_DIMENSIONS)
    expect(projection?.vector[0]).toBeCloseTo(0.6)
    expect(projection?.vector[1]).toBeCloseTo(0.8)
  })

  it("deletes an existing projection when the issue centroid is empty", async () => {
    const issue = makeIssue()
    const { repository: issueRepository } = createFakeIssueRepository([issue])
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository()

    store.set(`${organizationId}_${projectId}::${issue.uuid}`, {
      uuid: issue.uuid,
      title: issue.name,
      description: issue.description,
      vector: makeEmbedding(),
      organizationId,
      projectId,
    })

    await Effect.runPromise(
      syncIssueProjectionsUseCase({
        organizationId,
        issueId: issue.id,
      }).pipe(
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
      ),
    )

    expect(store.has(`${organizationId}_${projectId}::${issue.uuid}`)).toBe(false)
  })
})
