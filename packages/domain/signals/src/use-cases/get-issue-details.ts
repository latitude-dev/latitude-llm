import {
  deriveSignalAlignmentState,
  type Evaluation,
  EvaluationRepository,
  isActiveEvaluation,
  type SignalAlignmentState,
} from "@domain/evaluations"
import type { WorkflowQuerier } from "@domain/queue"
import { ScoreAnalyticsRepository, type SignalOccurrenceBucket } from "@domain/scores"
import type {
  ChSqlClient,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SignalId,
  SqlClient,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { SignalState } from "../entities/issue.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository, type SignalWithLifecycle } from "../ports/issue-repository.ts"

const TREND_DAYS = 14
const ONE_DAY_SECONDS = 86_400

export interface GetSignalDetailsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly now?: Date
}

export interface SignalDetails {
  readonly issue: SignalWithLifecycle
  readonly states: readonly SignalState[]
  /** Earliest occurrence over the full history of the issue. `null` when no occurrences are recorded yet. */
  readonly firstSeenAt: Date | null
  /** Latest occurrence over the full history. `null` when no occurrences are recorded yet. */
  readonly lastSeenAt: Date | null
  /** Lifetime occurrence count. */
  readonly occurrences: number
  /** Fraction of project traces affected by this issue over its lifetime, in `[0, 1]`. */
  readonly affectedTracesPercent: number
  /** Tags seen on the issue's occurrences over its lifetime. */
  readonly tags: readonly string[]
  /** Last 14 days of daily occurrence buckets, UTC-aligned. */
  readonly trend: readonly SignalOccurrenceBucket[]
  /** Active evaluations linked to the issue (archived / soft-deleted are excluded). */
  readonly evaluations: readonly Evaluation[]
  /** Real-time monitoring workflow state — idle, generating, or realigning. */
  readonly alignmentState: SignalAlignmentState
}

export type GetSignalDetailsError = NotFoundError | RepositoryError

/**
 * Loads the full-detail view of one issue: lifecycle states, lifetime
 * occurrence stats (`occurrences`, `firstSeenAt`, `lastSeenAt`,
 * `affectedTracesPercent`, `tags`), a 14-day trend, the active evaluations
 * monitoring it, and the real-time `alignmentState` derived from running
 * Temporal workflows.
 *
 * The lifetime tag aggregation uses the issue's `firstSeenAt` (falling back
 * to its `createdAt`) as the partition-pruning lower bound on ClickHouse, so
 * the scan stays bounded even for old, high-traffic issues.
 */
export const getSignalDetailsUseCase = (
  input: GetSignalDetailsInput,
): Effect.Effect<
  SignalDetails,
  GetSignalDetailsError,
  | ChSqlClient
  | EvaluationRepository
  | SignalRepository
  | ScoreAnalyticsRepository
  | SqlClient
  | TraceRepository
  | WorkflowQuerier
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const now = input.now ?? new Date()
    const signalRepository = yield* SignalRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const evaluationRepository = yield* EvaluationRepository
    const traceRepository = yield* TraceRepository

    const issue = yield* signalRepository.findById(input.signalId)

    const [occurrenceAggregates, trend, evaluationsPage, totalTraces] = yield* Effect.all([
      scoreAnalyticsRepository.aggregateBySignals({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalIds: [input.signalId],
      }),
      scoreAnalyticsRepository.trendBySignal({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
        days: TREND_DAYS,
        bucketSeconds: ONE_DAY_SECONDS,
      }),
      evaluationRepository.listBySignalId({
        projectId: input.projectId,
        signalId: input.signalId,
        options: { lifecycle: "active" },
      }),
      traceRepository.countByProjectId({
        organizationId: input.organizationId,
        projectId: input.projectId,
      }),
    ])

    const aggregate = occurrenceAggregates[0] ?? null
    const tagsLowerBound = aggregate?.firstSeenAt ?? issue.createdAt
    const tagsAggregates = yield* scoreAnalyticsRepository.aggregateTagsBySignals({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalIds: [input.signalId],
      timeRange: { from: tagsLowerBound, to: now },
    })

    const states = deriveSignalLifecycleStates({
      issue,
      isEscalating: issue.lifecycle.isEscalating,
      isRegressed: issue.lifecycle.isRegressed,
      now,
    })

    const occurrences = aggregate?.totalOccurrences ?? 0
    const affectedTracesPercent = totalTraces === 0 ? 0 : Math.min(occurrences / totalTraces, 1)
    const tags = tagsAggregates[0]?.tags ?? []
    const activeEvaluations = evaluationsPage.items.filter(isActiveEvaluation)

    const alignmentState = yield* deriveSignalAlignmentState({
      signalId: input.signalId,
      activeEvaluations,
      isAutomaticallyMonitored: issue.source === "flagger",
    })

    return {
      issue,
      states,
      firstSeenAt: aggregate?.firstSeenAt ?? null,
      lastSeenAt: aggregate?.lastSeenAt ?? null,
      occurrences,
      affectedTracesPercent,
      tags,
      trend,
      evaluations: activeEvaluations,
      alignmentState,
    } satisfies SignalDetails
  }).pipe(Effect.withSpan("issues.getSignalDetails"))
