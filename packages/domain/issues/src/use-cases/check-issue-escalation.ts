import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { type ChSqlClient, IssueId, OrganizationId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { IssueNotFoundForAssignmentError } from "../errors.ts"
import { getEscalationExitThreshold, getEscalationOccurrenceThreshold } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

export interface CheckIssueEscalationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
}

export type CheckIssueEscalationTransition = "entered" | "exited" | "none"

export interface CheckIssueEscalationResult {
  readonly transition: CheckIssueEscalationTransition
  readonly currentlyEscalating: boolean
}

export type CheckIssueEscalationError = RepositoryError | IssueNotFoundForAssignmentError

/**
 * Reify the (otherwise read-time-derived) escalating state on an issue.
 *
 * Entry: previously not escalating, `recentOccurrences >= entryThreshold`.
 * Sets `escalatedAt = now`, emits `IssueEscalated`.
 *
 * Exit: previously escalating, `recentOccurrences < exitThreshold` (lower
 * than the entry threshold by `ESCALATION_EXIT_THRESHOLD_FACTOR` to prevent
 * flapping at the boundary). Clears `escalatedAt`, emits `IssueEscalationEnded`.
 *
 * Idempotent: the stored `escalatedAt` field gates re-emission, mirroring
 * the regression-detection pattern in `assign-score-to-issue.ts`.
 */
export const checkIssueEscalationUseCase = (input: CheckIssueEscalationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const sqlClient = yield* SqlClient
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository

    // Aggregate is read from ClickHouse outside the Postgres transaction —
    // it's a read-only analytics query that doesn't need transactional
    // consistency with the issue write below.
    const aggregates = yield* scoreAnalyticsRepository.aggregateByIssues({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      issueIds: [IssueId(input.issueId)],
    })
    const aggregate = aggregates[0]
    const recent = aggregate?.recentOccurrences ?? 0
    const baseline = aggregate?.baselineAvgOccurrences ?? 0

    const entryThreshold = getEscalationOccurrenceThreshold(baseline)
    const exitThreshold = getEscalationExitThreshold(baseline)

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const issue = yield* issueRepository
          .findByIdForUpdate(IssueId(input.issueId))
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new IssueNotFoundForAssignmentError({ issueId: input.issueId })),
            ),
          )

        const wasEscalating = issue.escalatedAt !== null
        const now = new Date()

        if (!wasEscalating && recent >= entryThreshold) {
          yield* issueRepository.save({ ...issue, escalatedAt: now, updatedAt: now })
          yield* outboxEventWriter.write({
            eventName: "IssueEscalated",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              issueId: issue.id,
              escalatedAt: now.toISOString(),
            },
          })
          return {
            transition: "entered",
            currentlyEscalating: true,
          } satisfies CheckIssueEscalationResult
        }

        if (wasEscalating && recent < exitThreshold) {
          yield* issueRepository.save({ ...issue, escalatedAt: null, updatedAt: now })
          yield* outboxEventWriter.write({
            eventName: "IssueEscalationEnded",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              issueId: issue.id,
              endedAt: now.toISOString(),
            },
          })
          return {
            transition: "exited",
            currentlyEscalating: false,
          } satisfies CheckIssueEscalationResult
        }

        return {
          transition: "none",
          currentlyEscalating: wasEscalating,
        } satisfies CheckIssueEscalationResult
      }),
    )
  }).pipe(Effect.withSpan("issues.checkIssueEscalation")) as Effect.Effect<
    CheckIssueEscalationResult,
    CheckIssueEscalationError,
    SqlClient | ChSqlClient | IssueRepository | ScoreAnalyticsRepository | OutboxEventWriter
  >
