import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  IssueId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { IssueNotFoundForEscalationCheckError } from "../errors.ts"
import { getEscalationExitThreshold, getEscalationOccurrenceThreshold, isIssueNew } from "../helpers.ts"
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

export type CheckIssueEscalationError = RepositoryError | IssueNotFoundForEscalationCheckError

/**
 * Decide whether an issue's escalation state has transitioned and emit the
 * matching event. The "currently escalating" truth lives on the
 * `alert_incidents` table — read here via `IssueRepository.findById`'s
 * joined `lifecycle.isEscalating` flag — and on/off transitions are
 * actuated by emitting `IssueEscalated` / `IssueEscalationEnded`. The
 * downstream alert-incidents worker is what creates / closes the
 * `alert_incidents` row, so this use case never writes the issue itself.
 *
 * Entry: not currently escalating, the issue is no longer "new", and
 * `recentOccurrences >= entryThreshold`.
 *
 * Exit: currently escalating and `recentOccurrences < exitThreshold`
 * (lower than entry by `ESCALATION_EXIT_THRESHOLD_FACTOR` to prevent
 * flapping). Sustained-but-not-rising volume keeps the incident open
 * until the rolling baseline catches up.
 *
 * The `isIssueNew` guard mirrors `deriveIssueLifecycleStates` — new issues
 * have no real baseline (the baseline window is days 1–8 ago, not yet
 * filled in), so any volume above the floor would falsely trip entry.
 *
 * Idempotent: the open `issue.escalating` row in `alert_incidents` (read
 * via the lifecycle flag) gates re-emission. A re-run after a transition
 * sees the flipped state and no-ops.
 */
export const checkIssueEscalationUseCase = (input: CheckIssueEscalationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const issueRepository = yield* IssueRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const outboxEventWriter = yield* OutboxEventWriter

    const issueWithLifecycle = yield* issueRepository
      .findById(IssueId(input.issueId))
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new IssueNotFoundForEscalationCheckError({ issueId: input.issueId })),
        ),
      )

    const wasEscalating = issueWithLifecycle.lifecycle.isEscalating

    const aggregates = yield* scoreAnalyticsRepository.aggregateByIssues({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      issueIds: [IssueId(input.issueId)],
    })
    const aggregate = aggregates[0]
    const recent = aggregate?.recentOccurrences ?? 0
    const baseline = aggregate?.baselineAvgOccurrences ?? 0
    const firstSeenAt = aggregate?.firstSeenAt ?? issueWithLifecycle.createdAt

    const entryThreshold = getEscalationOccurrenceThreshold(baseline)
    const exitThreshold = getEscalationExitThreshold(baseline)
    const now = new Date()

    if (!wasEscalating && !isIssueNew(firstSeenAt, now) && recent >= entryThreshold) {
      yield* outboxEventWriter.write({
        eventName: "IssueEscalated",
        aggregateType: "issue",
        aggregateId: issueWithLifecycle.id,
        organizationId: issueWithLifecycle.organizationId,
        payload: {
          organizationId: issueWithLifecycle.organizationId,
          projectId: issueWithLifecycle.projectId,
          issueId: issueWithLifecycle.id,
          escalatedAt: now.toISOString(),
        },
      })
      return {
        transition: "entered",
        currentlyEscalating: true,
      } satisfies CheckIssueEscalationResult
    }

    if (wasEscalating && recent < exitThreshold) {
      yield* outboxEventWriter.write({
        eventName: "IssueEscalationEnded",
        aggregateType: "issue",
        aggregateId: issueWithLifecycle.id,
        organizationId: issueWithLifecycle.organizationId,
        payload: {
          organizationId: issueWithLifecycle.organizationId,
          projectId: issueWithLifecycle.projectId,
          issueId: issueWithLifecycle.id,
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
  }).pipe(Effect.withSpan("issues.checkIssueEscalation")) as Effect.Effect<
    CheckIssueEscalationResult,
    CheckIssueEscalationError,
    SqlClient | ChSqlClient | IssueRepository | ScoreAnalyticsRepository | OutboxEventWriter
  >
