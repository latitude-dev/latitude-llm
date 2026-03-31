import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { createFakeIssueProjectionRepository } from "../testing/fake-issue-projection-repository.ts"
import { hybridSearchIssuesUseCase } from "./hybrid-search-issues.ts"

describe("hybridSearchIssuesUseCase", () => {
  it("queries Weaviate issue projection repository for project tenant", async () => {
    const organizationId = "org-1"
    const projectId = "proj-1"
    const tenantName = `${organizationId}:${projectId}`
    const { service } = createFakeIssueProjectionRepository()

    await Effect.runPromise(
      service.upsert({
        uuid: "issue-1",
        title: "Token leakage",
        description: "Agent exposed API tokens",
        vector: [1, 0],
        tenantName,
      }),
    )

    const result = await Effect.runPromise(
      hybridSearchIssuesUseCase({
        organizationId,
        projectId,
        query: "token leakage",
        normalizedEmbedding: [1, 0],
      }).pipe(Effect.provideService(IssueProjectionRepository, service)),
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.uuid).toBe("issue-1")
  })
})
