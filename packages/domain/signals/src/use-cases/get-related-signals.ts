import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SignalId,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_RELATED_CANDIDATE_LIMIT, SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS } from "../constants.ts"
import type { SignalState } from "../entities/signal.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { type RelatedSignalSignals, rankRelatedSignals } from "../related-signals.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface GetRelatedSignalsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly now?: Date
}

/** One Related-list row: scored signals hydrated with the canonical issue. */
export interface RelatedSignal extends RelatedSignalSignals {
  readonly slug: string
  readonly name: string
  /** Shown on the card so users can judge the similarity themselves. */
  readonly description: string
  readonly states: readonly SignalState[]
  /** Lifetime occurrence count; 0 when the issue has no analytics rows. */
  readonly occurrences: number
  /** Last occurrence timestamp; null when the issue has no analytics rows. */
  readonly lastSeenAt: Date | null
}

export type GetRelatedSignalsError = RepositoryError

/**
 * The Related-issues read: runs the two candidate reads in parallel —
 * semantic neighbors (pgvector centroid cosine, lifetime) and session
 * co-occurrence counts (ClickHouse, trailing
 * `SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS`) — fuses them with the pure
 * scorer (`rankRelatedSignals`), and hydrates the surviving rows from
 * Postgres with lifecycle states derived here. Resolved/ignored issues are
 * included by design: "a similar issue was already resolved" is the most
 * actionable row. Project-scoped only.
 */
export const getRelatedSignalsUseCase = (
  input: GetRelatedSignalsInput,
): Effect.Effect<
  readonly RelatedSignal[],
  GetRelatedSignalsError,
  ChSqlClient | SignalRepository | ScoreAnalyticsRepository | SqlClient
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const signalRepository = yield* SignalRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const now = input.now ?? new Date()
    const from = new Date(now.getTime() - SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS * MILLISECONDS_PER_DAY)

    const [neighbors, coOccurrence] = yield* Effect.all(
      [
        signalRepository.findSimilarByCentroid({
          projectId: input.projectId,
          signalId: input.signalId,
          limit: SIGNAL_RELATED_CANDIDATE_LIMIT,
        }),
        scoreAnalyticsRepository.coOccurrenceBySignal({
          organizationId: input.organizationId,
          projectId: input.projectId,
          signalId: input.signalId,
          timeRange: { from, to: now },
          limit: SIGNAL_RELATED_CANDIDATE_LIMIT,
        }),
      ],
      { concurrency: 2 },
    )

    const ranked = rankRelatedSignals({ neighbors, coOccurrence })
    if (ranked.length === 0) return []

    const rankedSignalIds = ranked.map((signals) => SignalId(signals.signalId))
    const [issues, occurrenceAggregates] = yield* Effect.all(
      [
        signalRepository.findByIds({ projectId: input.projectId, signalIds: rankedSignalIds }),
        // Lifetime occurrences + last-seen per row, so the card can show how
        // active each neighbor is. Batched — one read for the whole list.
        scoreAnalyticsRepository.aggregateBySignals({
          organizationId: input.organizationId,
          projectId: input.projectId,
          signalIds: rankedSignalIds,
        }),
      ],
      { concurrency: 2 },
    )
    const signalsById = new Map(issues.map((issue) => [issue.id as string, issue]))
    const aggregatesById = new Map(occurrenceAggregates.map((aggregate) => [aggregate.signalId as string, aggregate]))

    return ranked.flatMap((signals): RelatedSignal[] => {
      // A candidate can vanish between the analytics read and hydration (or
      // exist only in ClickHouse after a Postgres delete) — drop it silently.
      const issue = signalsById.get(signals.signalId)
      if (issue === undefined) return []
      const aggregate = aggregatesById.get(signals.signalId)
      return [
        {
          ...signals,
          slug: issue.slug,
          name: issue.name,
          description: issue.description,
          states: deriveSignalLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
            now,
          }),
          occurrences: aggregate?.totalOccurrences ?? 0,
          lastSeenAt: aggregate?.lastSeenAt ?? null,
        },
      ]
    })
  }).pipe(Effect.withSpan("issues.getRelatedSignals"))
