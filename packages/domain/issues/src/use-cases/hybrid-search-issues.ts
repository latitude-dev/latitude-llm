import { Effect } from "effect"
import { type IssueProjectionCandidate, IssueProjectionRepository } from "../ports/issue-projection-repository.ts"

export interface HybridSearchIssuesInput {
  readonly organizationId: string
  readonly projectId: string
  readonly query: string
  readonly normalizedEmbedding: number[]
}

export interface HybridSearchIssuesResult {
  readonly candidates: readonly IssueProjectionCandidate[]
}

export const hybridSearchIssuesUseCase = (input: HybridSearchIssuesInput) =>
  Effect.gen(function* () {
    const issueProjectionRepository = yield* IssueProjectionRepository

    const candidates = yield* issueProjectionRepository.hybridSearch({
      organizationId: input.organizationId,
      projectId: input.projectId,
      query: input.query,
      vector: input.normalizedEmbedding,
    })

    return {
      candidates,
    } satisfies HybridSearchIssuesResult
  })
