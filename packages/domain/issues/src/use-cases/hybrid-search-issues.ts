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
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const issueProjectionRepository = yield* IssueProjectionRepository

    const candidates = yield* issueProjectionRepository.hybridSearch({
      projectId: input.projectId,
      query: input.query,
      vector: input.normalizedEmbedding,
    })

    return {
      candidates,
    } satisfies HybridSearchIssuesResult
  }).pipe(Effect.withSpan("issues.hybridSearchIssues"))
