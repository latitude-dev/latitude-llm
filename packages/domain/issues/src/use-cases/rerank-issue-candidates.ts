import { AI } from "@domain/ai"
import { Effect } from "effect"
import { MIN_RERANK_RELEVANCE, RERANK_MODEL } from "../constants.ts"
import type { IssueProjectionCandidate } from "../ports/issue-projection-repository.ts"

export interface RerankIssueCandidatesInput {
  readonly query: string
  readonly candidates: readonly IssueProjectionCandidate[]
}

export interface RetrievalResult {
  readonly matchedIssueUuid: string | null
  readonly similarityScore: number
}

export const rerankIssueCandidatesUseCase = (input: RerankIssueCandidatesInput) =>
  Effect.gen(function* () {
    if (input.candidates.length === 0) {
      return {
        matchedIssueUuid: null,
        similarityScore: 0,
      } satisfies RetrievalResult
    }

    const ai = yield* AI
    const reranked = yield* ai.rerank({
      query: input.query,
      documents: input.candidates.map((candidate) => candidate.description),
      model: RERANK_MODEL,
    })

    const best = reranked
      .filter((item) => item.relevanceScore >= MIN_RERANK_RELEVANCE)
      .sort((left, right) => right.relevanceScore - left.relevanceScore)[0]

    if (!best) {
      return {
        matchedIssueUuid: null,
        similarityScore: 0,
      } satisfies RetrievalResult
    }

    const matchedIssue = input.candidates[best.index]
    if (!matchedIssue) {
      return {
        matchedIssueUuid: null,
        similarityScore: 0,
      } satisfies RetrievalResult
    }

    return {
      matchedIssueUuid: matchedIssue.uuid,
      similarityScore: best.relevanceScore,
    } satisfies RetrievalResult
  })
