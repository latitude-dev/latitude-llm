import type { IssueCoOccurrenceAggregate } from "@domain/scores"
import {
  ISSUE_RELATED_LIMIT,
  ISSUE_RELATED_MIN_RELATEDNESS,
  ISSUE_RELATED_MIN_SHARED_SESSIONS,
  ISSUE_RELATED_SEMANTIC_CEILING,
  ISSUE_RELATED_SEMANTIC_FLOOR,
} from "./constants.ts"
import type { IssueCentroidNeighbor } from "./ports/issue-repository.ts"

/**
 * Pure scoring for the Related-issues list. Two independent signals are
 * normalized to `[0, 1]` and fused:
 *
 * - **Semantic** — centroid cosine similarity, rescaled linearly over its
 *   useful band (`ISSUE_RELATED_SEMANTIC_FLOOR`..`CEILING`). Raw cosine is
 *   bounded but its meaning is concentrated in that band: pairs at/above the
 *   ceiling would have been merged by discovery, pairs below the floor are
 *   noise.
 * - **Co-occurrence** — NPMI (normalized pointwise mutual information) over
 *   session sets, clamped at 0, gated on a minimum shared-session count.
 *   NPMI is preferred over raw lift (unbounded, inflated for rare pairs) and
 *   over Jaccard/overlap percent (inflated by big neighbors that overlap
 *   everything by chance): its numerator *is* log-lift and its denominator
 *   normalizes by joint-event rarity, killing both failure modes at the
 *   source.
 * - **Fusion** — noisy-OR (`1 − (1−a)(1−b)`): either signal alone carries a
 *   row; a row scoring on both (the "possibly the same issue" case) ranks
 *   above either alone.
 *
 * The combined score is sort-order only — the UI shows reason chips (shared
 * session percent, "similar failure pattern"), never the raw numbers. Design
 * rationale: `specs/issue-details-page.md` (Data model #3).
 */

/** Per-candidate scored signals; `null` means the signal contributed nothing. */
export interface RelatedIssueSignals {
  readonly issueId: string
  /** Noisy-OR of the two signal scores, in `[0, 1]`. Sort key, never displayed. */
  readonly relatedness: number
  readonly semantic: {
    /** Raw centroid cosine similarity. */
    readonly similarity: number
    /** Band-rescaled score in `[0, 1]`. */
    readonly score: number
  } | null
  readonly coOccurrence: {
    readonly sharedSessions: number
    /** `sharedSessions / mySessions` — share of the source issue's sessions where this issue also appears. */
    readonly sharedSessionsPercent: number
    /** Clamped NPMI in `[0, 1]`. */
    readonly score: number
  } | null
}

/** Linear rescale of centroid cosine similarity over its useful band, clamped to `[0, 1]`. */
export const semanticRelatednessScore = (similarity: number): number => {
  const band = ISSUE_RELATED_SEMANTIC_CEILING - ISSUE_RELATED_SEMANTIC_FLOOR
  return Math.min(1, Math.max(0, (similarity - ISSUE_RELATED_SEMANTIC_FLOOR) / band))
}

export interface CoOccurrenceScoreInput {
  /** Sessions where both issues have an occurrence. */
  readonly sharedSessions: number
  /** Sessions where the source issue has an occurrence. */
  readonly mySessions: number
  /** Sessions where the candidate issue has an occurrence. */
  readonly theirSessions: number
  /** Sessions with any issue occurrence — the probability universe. */
  readonly totalSessions: number
}

/**
 * Clamped NPMI over session sets: `ln(P(A,B) / (P(A)·P(B))) / −ln(P(A,B))`,
 * 0 when at/below chance (lift ≤ 1) or under the shared-session floor.
 * Approaches 1 as two issues occur in exactly the same sessions and those
 * sessions are rare in the universe.
 */
export const coOccurrenceRelatednessScore = (input: CoOccurrenceScoreInput): number => {
  const { sharedSessions, mySessions, theirSessions, totalSessions } = input
  if (sharedSessions < ISSUE_RELATED_MIN_SHARED_SESSIONS) return 0
  if (totalSessions === 0 || mySessions === 0 || theirSessions === 0) return 0

  const pBoth = sharedSessions / totalSessions
  const pMine = mySessions / totalSessions
  const pTheirs = theirSessions / totalSessions
  const pmi = Math.log(pBoth / (pMine * pTheirs))
  // At/below chance (lift ≤ 1) there is no association to report. This also
  // covers the degenerate pBoth === 1 case (then pMine = pTheirs = 1, pmi = 0),
  // so the −ln(pBoth) denominator below is always strictly positive.
  if (pmi <= 0) return 0

  return Math.min(1, pmi / -Math.log(pBoth))
}

/** Noisy-OR fusion: either signal alone carries a row, both together rank higher than either. */
export const combinedRelatedness = (semanticScore: number, coOccurrenceScore: number): number =>
  1 - (1 - semanticScore) * (1 - coOccurrenceScore)

export interface RankRelatedIssuesInput {
  /** Semantic neighbors from `IssueRepository.findSimilarByCentroid`. */
  readonly neighbors: readonly IssueCentroidNeighbor[]
  /** Session co-occurrence counts from `ScoreAnalyticsRepository.coOccurrenceByIssue`. */
  readonly coOccurrence: IssueCoOccurrenceAggregate
  readonly limit?: number
}

/**
 * Merge the two candidate sets, score each signal, fuse with noisy-OR, gate on
 * `ISSUE_RELATED_MIN_RELATEDNESS`, and return the top rows by relatedness.
 * A signal that scored 0 is reported as `null` so the UI renders only the
 * reason chips that actually apply.
 */
export const rankRelatedIssues = (input: RankRelatedIssuesInput): readonly RelatedIssueSignals[] => {
  const limit = input.limit ?? ISSUE_RELATED_LIMIT
  const similarityById = new Map(input.neighbors.map((neighbor) => [neighbor.issueId as string, neighbor.similarity]))
  const coOccurrenceById = new Map(
    input.coOccurrence.candidates.map((candidate) => [candidate.issueId as string, candidate]),
  )
  const candidateIds = new Set([...similarityById.keys(), ...coOccurrenceById.keys()])

  return [...candidateIds]
    .flatMap((issueId): RelatedIssueSignals[] => {
      const similarity = similarityById.get(issueId)
      const candidate = coOccurrenceById.get(issueId)
      const semanticScore = similarity === undefined ? 0 : semanticRelatednessScore(similarity)
      const coOccurrenceScore =
        candidate === undefined
          ? 0
          : coOccurrenceRelatednessScore({
              sharedSessions: candidate.sharedSessions,
              theirSessions: candidate.theirSessions,
              mySessions: input.coOccurrence.mySessions,
              totalSessions: input.coOccurrence.totalSessions,
            })

      const relatedness = combinedRelatedness(semanticScore, coOccurrenceScore)
      if (relatedness < ISSUE_RELATED_MIN_RELATEDNESS) return []

      return [
        {
          issueId,
          relatedness,
          semantic: similarity !== undefined && semanticScore > 0 ? { similarity, score: semanticScore } : null,
          coOccurrence:
            candidate !== undefined && coOccurrenceScore > 0
              ? {
                  sharedSessions: candidate.sharedSessions,
                  sharedSessionsPercent:
                    input.coOccurrence.mySessions === 0 ? 0 : candidate.sharedSessions / input.coOccurrence.mySessions,
                  score: coOccurrenceScore,
                }
              : null,
        },
      ]
    })
    .sort((a, b) => b.relatedness - a.relatedness || a.issueId.localeCompare(b.issueId))
    .slice(0, limit)
}
