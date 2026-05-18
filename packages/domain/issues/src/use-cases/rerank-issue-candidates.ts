import { AI } from "@domain/ai"
import { Effect } from "effect"
import {
  ISSUE_DISCOVERY_MIN_RELEVANCE,
  ISSUE_DISCOVERY_RERANK_CANDIDATES,
  ISSUE_DISCOVERY_RERANK_MODEL,
} from "../constants.ts"
import type { IssueSearchCandidate } from "../ports/issue-repository.ts"

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const buildRerankDocument = (candidate: IssueSearchCandidate): string =>
  [collapseWhitespace(candidate.name), collapseWhitespace(candidate.description)].join("\n\n")

export interface RerankIssueCandidatesInput {
  readonly query: string
  readonly candidates: readonly IssueSearchCandidate[]
}

export interface RetrievalResult {
  readonly matchedIssueId: string | null
  readonly similarityScore: number
}

// TODO(issue-discovery-rerank): delete this use case when discovery matching
// moves to pgvector-only top-candidate selection with calibrated thresholds.
// Keeping this isolated makes the temporary third-party dependency easy to remove.
export const rerankIssueCandidatesUseCase = Effect.fn("issues.rerankIssueCandidates")(function* (
  input: RerankIssueCandidatesInput,
) {
  yield* Effect.annotateCurrentSpan("candidateCount", input.candidates.length)
  const limitedCandidates = [...input.candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, ISSUE_DISCOVERY_RERANK_CANDIDATES)

  if (limitedCandidates.length === 0) {
    return {
      matchedIssueId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  const ai = yield* AI
  const reranked = yield* ai.rerank({
    query: input.query,
    documents: limitedCandidates.map(buildRerankDocument),
    model: ISSUE_DISCOVERY_RERANK_MODEL,
    telemetry: {
      spanName: "rerank-issue-candidates",
      tags: ["issues", "rerank"],
      metadata: {
        candidateCount: limitedCandidates.length,
      },
    },
  })

  const best = reranked
    .filter((item) => item.relevanceScore >= ISSUE_DISCOVERY_MIN_RELEVANCE)
    .sort((left, right) => right.relevanceScore - left.relevanceScore)[0]

  if (!best) {
    return {
      matchedIssueId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  const matchedIssue = limitedCandidates[best.index]
  if (!matchedIssue) {
    return {
      matchedIssueId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  return {
    matchedIssueId: matchedIssue.issueId,
    similarityScore: best.relevanceScore,
  } satisfies RetrievalResult
})
