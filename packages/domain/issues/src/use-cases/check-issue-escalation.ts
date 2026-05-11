import { AlertIncidentRepository } from "@domain/alerts"
import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  IssueId,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SettingsReader,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { DEFAULT_ESCALATION_SENSITIVITY_K } from "../constants.ts"
import { IssueNotFoundForEscalationCheckError } from "../errors.ts"
import { evaluateSeasonalEscalation, isIssueNew } from "../helpers.ts"
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

export type CheckIssueEscalationError = RepositoryError | NotFoundError | IssueNotFoundForEscalationCheckError

/**
 * Decide whether an issue's escalation state has transitioned and emit the
 * matching event. The "currently escalating" truth lives on the
 * `alert_incidents` table — joined here via `IssueRepository.findById`'s
 * `lifecycle.isEscalating` flag — and on/off transitions are actuated by
 * emitting `IssueEscalated` / `IssueEscalationEnded`. The downstream
 * alert-incidents worker creates / closes the `alert_incidents` row, so
 * this use case never writes the issue itself.
 *
 * The decision math lives in the pure `evaluateSeasonalEscalation` helper.
 * This wrapper is the I/O boundary: it reads the issue, the open incident
 * (for the entry snapshot + dwell tracker), the seasonal signals, and the
 * per-project sensitivity setting; calls the helper; then emits the
 * transition event or persists the dwell delta.
 *
 * Persisting the dwell on no-ops is the only direct write path here. Open /
 * close are still emitted via the outbox and applied asynchronously by the
 * alert-incidents worker — same separation as before.
 *
 * Idempotency: re-emitting on transitions is gated by `lifecycle.isEscalating`,
 * which reads the open `alert_incidents` row. A re-run after a transition
 * sees the flipped state and no-ops.
 */
export const checkIssueEscalationUseCase = (input: CheckIssueEscalationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const issueRepository = yield* IssueRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const outboxEventWriter = yield* OutboxEventWriter
    const alertIncidentRepository = yield* AlertIncidentRepository
    const settingsReader = yield* SettingsReader

    const issueWithLifecycle = yield* issueRepository
      .findById(IssueId(input.issueId))
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new IssueNotFoundForEscalationCheckError({ issueId: input.issueId })),
        ),
      )

    const wasEscalating = issueWithLifecycle.lifecycle.isEscalating
    const now = new Date()

    const [signals, projectSettings, openIncident] = yield* Effect.all(
      [
        scoreAnalyticsRepository
          .escalationSignalsByIssues({
            organizationId: OrganizationId(input.organizationId),
            projectId: ProjectId(input.projectId),
            issueIds: [IssueId(input.issueId)],
            now,
          })
          .pipe(Effect.map((entries) => entries[0])),
        settingsReader.getProjectSettings(ProjectId(input.projectId)),
        wasEscalating
          ? alertIncidentRepository.findOpen({ sourceType: "issue", sourceId: input.issueId, kind: "issue.escalating" })
          : Effect.succeed(null),
      ],
      { concurrency: "unbounded" },
    )

    if (!signals) {
      // No analytics row at all — equivalent to recent=0. Helper returns "none"
      // and we no-op rather than threading conditionals down the path.
      return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckIssueEscalationResult
    }

    const kShort = projectSettings?.alertNotifications?.escalationSensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

    const decision = evaluateSeasonalEscalation({
      signals,
      kShort,
      isNew: isIssueNew(issueWithLifecycle.createdAt, now),
      wasEscalating,
      entrySignals: openIncident?.entrySignals ?? null,
      startedAt: openIncident?.startedAt ?? null,
      exitEligibleSince: openIncident?.exitEligibleSince ?? null,
      now,
    })

    if (decision.transition === "enter") {
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
          entrySignals: decision.entrySignalsSnapshot ?? null,
        },
      })
      return { transition: "entered", currentlyEscalating: true } satisfies CheckIssueEscalationResult
    }

    if (decision.transition === "exit") {
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
          reason: decision.reason ?? "threshold",
        },
      })
      return { transition: "exited", currentlyEscalating: false } satisfies CheckIssueEscalationResult
    }

    // transition === "none". Persist dwell delta if the open incident's
    // stored exit_eligible_since changed. Skips the write when nothing
    // changed (most common case) and when there's no open incident to
    // write to in the first place.
    if (openIncident !== null) {
      const previous = openIncident.exitEligibleSince?.getTime() ?? null
      const next = decision.nextExitEligibleSince?.getTime() ?? null
      if (previous !== next) {
        yield* alertIncidentRepository.updateExitDwell({
          id: openIncident.id,
          exitEligibleSince: decision.nextExitEligibleSince,
        })
      }
    }

    return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckIssueEscalationResult
  }).pipe(Effect.withSpan("issues.checkIssueEscalation")) as Effect.Effect<
    CheckIssueEscalationResult,
    CheckIssueEscalationError,
    | SqlClient
    | ChSqlClient
    | IssueRepository
    | ScoreAnalyticsRepository
    | OutboxEventWriter
    | AlertIncidentRepository
    | SettingsReader
  >
