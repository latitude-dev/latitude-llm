import { AI, resolveRerankingConfig } from "@domain/ai"
import { Effect } from "effect"
import { SIGNAL_DISCOVERY_MIN_RELEVANCE, SIGNAL_DISCOVERY_RERANK_CANDIDATES } from "../constants.ts"
import type { SignalSearchCandidate } from "../ports/signal-repository.ts"

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const buildRerankDocument = (candidate: SignalSearchCandidate): string =>
  [collapseWhitespace(candidate.name), collapseWhitespace(candidate.description)].join("\n\n")

export interface RerankSignalCandidatesInput {
  readonly query: string
  readonly candidates: readonly SignalSearchCandidate[]
}

export interface RetrievalResult {
  readonly matchedSignalId: string | null
  readonly similarityScore: number
}

// TODO(signal-discovery-rerank): delete this use case when discovery matching
// moves to pgvector-only top-candidate selection with calibrated thresholds.
// Keeping this isolated makes the temporary third-party dependency easy to remove.
export const rerankSignalCandidatesUseCase = Effect.fn("issues.rerankSignalCandidates")(function* (
  input: RerankSignalCandidatesInput,
) {
  yield* Effect.annotateCurrentSpan("candidateCount", input.candidates.length)
  const limitedCandidates = [...input.candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, SIGNAL_DISCOVERY_RERANK_CANDIDATES)

  if (limitedCandidates.length === 0) {
    return {
      matchedSignalId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  const ai = yield* AI
  const reranked = yield* resolveRerankingConfig().pipe(
    Effect.flatMap((rerankingConfig) =>
      ai.rerank({
        query: input.query,
        documents: limitedCandidates.map(buildRerankDocument),
        provider: rerankingConfig.provider,
        model: rerankingConfig.model,
        telemetry: {
          spanName: "rerank-signal-candidates",
          tags: ["issues", "rerank"],
          metadata: {
            candidateCount: limitedCandidates.length,
          },
        },
      }),
    ),
    // No rerank provider configured/reachable → degrade instead of failing the
    // discovery job: fall back to the hybrid-search order. Candidates are
    // already filtered to high-confidence matches by the search thresholds, so
    // the top-scored one is the best available match.
    Effect.catchTag("AIError", (error) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan("rerankUnavailable", true)
        yield* Effect.logWarning("signal-discovery rerank unavailable; falling back to hybrid-search order", error)
        return null
      }),
    ),
  )

  if (reranked === null) {
    const top = limitedCandidates[0]
    return {
      matchedSignalId: top?.signalId ?? null,
      similarityScore: top?.score ?? 0,
    } satisfies RetrievalResult
  }

  const best = reranked
    .filter((item) => item.relevanceScore >= SIGNAL_DISCOVERY_MIN_RELEVANCE)
    .sort((left, right) => right.relevanceScore - left.relevanceScore)[0]

  if (!best) {
    return {
      matchedSignalId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  const matchedSignal = limitedCandidates[best.index]
  if (!matchedSignal) {
    return {
      matchedSignalId: null,
      similarityScore: 0,
    } satisfies RetrievalResult
  }

  return {
    matchedSignalId: matchedSignal.signalId,
    similarityScore: best.relevanceScore,
  } satisfies RetrievalResult
})
