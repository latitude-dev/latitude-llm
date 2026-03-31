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
    const tenantName = `${input.organizationId}:${input.projectId}`

    const candidates = yield* issueProjectionRepository.hybridSearch({
      query: input.query,
      vector: input.normalizedEmbedding,
      tenantName,
    })

    return {
      candidates,
    } satisfies HybridSearchIssuesResult
  })
