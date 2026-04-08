import { IssueId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { resolveMatchedIssueUseCase } from "./resolve-matched-issue.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage in responses",
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

describe("resolveMatchedIssueUseCase", () => {
  it("returns null when rerank found no matched issue uuid", async () => {
    const { repository: issueRepository } = createFakeIssueRepository()

    const result = await Effect.runPromise(
      resolveMatchedIssueUseCase({
        organizationId,
        projectId,
        matchedIssueUuid: null,
      }).pipe(Effect.provideService(IssueRepository, issueRepository)),
    )

    expect(result).toEqual({
      issueId: null,
    })
  })

  it("resolves the matched issue uuid to the canonical issue id", async () => {
    const issue = makeIssue()
    const findByUuidCalls: unknown[] = []
    const { repository: issueRepository } = createFakeIssueRepository([issue], {
      findByUuid: (input) => {
        findByUuidCalls.push(input)
        return Effect.succeed(issue)
      },
    })

    const result = await Effect.runPromise(
      resolveMatchedIssueUseCase({
        organizationId,
        projectId,
        matchedIssueUuid: issue.uuid,
      }).pipe(Effect.provideService(IssueRepository, issueRepository)),
    )

    expect(result).toEqual({
      issueId: issue.id,
    })
    expect(findByUuidCalls).toEqual([
      {
        projectId: ProjectId(projectId),
        uuid: issue.uuid,
      },
    ])
  })

  it("returns null when the reranked match is stale in Postgres", async () => {
    const { repository: issueRepository } = createFakeIssueRepository()

    const result = await Effect.runPromise(
      resolveMatchedIssueUseCase({
        organizationId,
        projectId,
        matchedIssueUuid: "11111111-1111-4111-8111-111111111111",
      }).pipe(Effect.provideService(IssueRepository, issueRepository)),
    )

    expect(result).toEqual({
      issueId: null,
    })
  })
})
