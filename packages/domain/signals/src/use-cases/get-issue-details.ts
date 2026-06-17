import {
  deriveIssueAlignmentState,
  type Evaluation,
  EvaluationRepository,
  type IssueAlignmentState,
  isActiveEvaluation,
} from "@domain/evaluations"
import type { WorkflowQuerier } from "@domain/queue"
import { type IssueOccurrenceBucket, ScoreAnalyticsRepository } from "@domain/scores"
import type {
  ChSqlClient,
  IssueId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { IssueState } from "../entities/issue.ts"
import { deriveIssueLifecycleStates } from "../helpers.ts"
import { IssueRepository, type IssueWithLifecycle } from "../ports/issue-repository.ts"

const TREND_DAYS = 14
const ONE_DAY_SECONDS = 86_400

export interface GetIssueDetailsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly now?: Date
}

export interface IssueDetails {
  readonly issue: IssueWithLifecycle
  readonly states: readonly IssueState[]
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
  readonly trend: readonly IssueOccurrenceBucket[]
  /** Active evaluations linked to the issue (archived / soft-deleted are excluded). */
  readonly evaluations: readonly Evaluation[]
  /** Real-time monitoring workflow state — idle, generating, or realigning. */
  readonly alignmentState: IssueAlignmentState
}

export type GetIssueDetailsError = NotFoundError | RepositoryError

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
export const getIssueDetailsUseCase = (
  input: GetIssueDetailsInput,
): Effect.Effect<
  IssueDetails,
  GetIssueDetailsError,
  | ChSqlClient
  | EvaluationRepository
  | IssueRepository
  | ScoreAnalyticsRepository
  | SqlClient
  | TraceRepository
  | WorkflowQuerier
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("issueId", String(input.issueId))

    const now = input.now ?? new Date()
    const issueRepository = yield* IssueRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const evaluationRepository = yield* EvaluationRepository
    const traceRepository = yield* TraceRepository

    const issue = yield* issueRepository.findById(input.issueId)

    const [occurrenceAggregates, trend, evaluationsPage, totalTraces] = yield* Effect.all([
      scoreAnalyticsRepository.aggregateByIssues({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueIds: [input.issueId],
      }),
      scoreAnalyticsRepository.trendByIssue({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        days: TREND_DAYS,
        bucketSeconds: ONE_DAY_SECONDS,
      }),
      evaluationRepository.listByIssueId({
        projectId: input.projectId,
        issueId: input.issueId,
        options: { lifecycle: "active" },
      }),
      traceRepository.countByProjectId({
        organizationId: input.organizationId,
        projectId: input.projectId,
      }),
    ])

    const aggregate = occurrenceAggregates[0] ?? null
    const tagsLowerBound = aggregate?.firstSeenAt ?? issue.createdAt
    const tagsAggregates = yield* scoreAnalyticsRepository.aggregateTagsByIssues({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueIds: [input.issueId],
      timeRange: { from: tagsLowerBound, to: now },
    })

    const states = deriveIssueLifecycleStates({
      issue,
      isEscalating: issue.lifecycle.isEscalating,
      isRegressed: issue.lifecycle.isRegressed,
      now,
    })

    const occurrences = aggregate?.totalOccurrences ?? 0
    const affectedTracesPercent = totalTraces === 0 ? 0 : Math.min(occurrences / totalTraces, 1)
    const tags = tagsAggregates[0]?.tags ?? []
    const activeEvaluations = evaluationsPage.items.filter(isActiveEvaluation)

    const alignmentState = yield* deriveIssueAlignmentState({
      issueId: input.issueId,
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
    } satisfies IssueDetails
  }).pipe(Effect.withSpan("issues.getIssueDetails"))
