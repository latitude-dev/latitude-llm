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
  SqlClient,
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
  /**
   * Flag-on override resolved by the caller (`@domain/issues` can't import
   * `@domain/monitors`): the system monitor's sensitivity. Omitted → project settings.
   */
  readonly escalationSensitivity?: number
}

/** Look-back window + bucket for `startedAt` backtracking on the escalation `enter` transition. */
const BACKTRACK_WINDOW_MS = 24 * 60 * 60 * 1000
const BACKTRACK_BUCKET_SECONDS = 60 * 60

/**
 * The detector flags late (the band must hold a while), so backtrack: return the
 * first bucket whose count cleared the seasonal threshold (same `kShort`). No
 * crossing in the window → the event time (`now`).
 */
const backtrackEscalationStart = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly kShort: number
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const analytics = yield* ScoreAnalyticsRepository
    const to = input.now
    const from = new Date(to.getTime() - BACKTRACK_WINDOW_MS)
    const [counts, thresholds] = yield* Effect.all(
      [
        analytics.histogramByIssues({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueIds: [input.issueId],
          timeRange: { from, to },
          bucketSeconds: BACKTRACK_BUCKET_SECONDS,
        }),
        analytics.escalationThresholdHistogramByIssues({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueIds: [input.issueId],
          timeRange: { from, to },
          bucketSeconds: BACKTRACK_BUCKET_SECONDS,
          kShort: input.kShort,
        }),
      ],
      { concurrency: "unbounded" },
    )

    const thresholdByBucket = new Map<string, number>()
    for (const entry of thresholds[0]?.buckets ?? []) {
      if (Number.isFinite(entry.thresholdCount)) thresholdByBucket.set(entry.bucket, entry.thresholdCount)
    }

    const ascending = [...counts].sort((a, b) => a.bucket.localeCompare(b.bucket))
    for (const bucket of ascending) {
      const threshold = thresholdByBucket.get(bucket.bucket)
      if (threshold !== undefined && bucket.count >= threshold) {
        const ts = new Date(bucket.bucket)
        if (!Number.isNaN(ts.getTime())) return ts
      }
    }
    return input.now
  })

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
    const sqlClient = yield* SqlClient

    const issueWithLifecycle = yield* issueRepository
      .findById(IssueId(input.issueId))
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new IssueNotFoundForEscalationCheckError({ issueId: input.issueId })),
        ),
      )

    const wasEscalating = issueWithLifecycle.lifecycle.isEscalating
    const now = new Date()

    // Ignored issues keep accepting score assignments for analytics / matching,
    // but user intent is that they no longer drive automated lifecycle changes
    // or alerting transitions.
    if (issueWithLifecycle.ignoredAt !== null) {
      return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckIssueEscalationResult
    }

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

    // Flag-on override (system monitor) → else project settings → default.
    const kShort =
      input.escalationSensitivity ?? projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

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
      // Backtrack the start; the worker forwards `escalatedAt` as the incident's `occurredAt`.
      const startedAt = yield* backtrackEscalationStart({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        issueId: IssueId(input.issueId),
        kShort,
        now,
      })

      yield* sqlClient.transaction(
        Effect.gen(function* () {
          if (issueWithLifecycle.resolvedAt !== null) {
            yield* issueRepository.save({
              ...issueWithLifecycle,
              resolvedAt: null,
              updatedAt: now,
            })
          }

          yield* outboxEventWriter.write({
            eventName: "IssueEscalated",
            aggregateType: "issue",
            aggregateId: issueWithLifecycle.id,
            organizationId: issueWithLifecycle.organizationId,
            payload: {
              organizationId: issueWithLifecycle.organizationId,
              projectId: issueWithLifecycle.projectId,
              issueId: issueWithLifecycle.id,
              escalatedAt: startedAt.toISOString(),
              entrySignals: decision.entrySignalsSnapshot ?? null,
            },
          })
        }),
      )
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
