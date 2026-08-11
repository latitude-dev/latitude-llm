import { OutboxEventWriter } from "@domain/events"
import {
  DEFAULT_ESCALATION_SENSITIVITY_K,
  IncidentRepository,
  isSignalEscalationEntrySignals,
  makeEscalationEngine,
  SeriesReader,
} from "@domain/incidents"
import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SettingsReader,
  SignalId,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { SignalNotFoundForEscalationCheckError } from "../errors.ts"
import { isSignalNew, signalFirstVisibleAt } from "../helpers.ts"
import { makeScoreOccurrenceReader } from "../ports/score-occurrence-reader.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export interface CheckSignalEscalationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
}

export type CheckSignalEscalationTransition = "entered" | "exited" | "none"

export interface CheckSignalEscalationResult {
  readonly transition: CheckSignalEscalationTransition
  readonly currentlyEscalating: boolean
}

export type CheckSignalEscalationError = RepositoryError | NotFoundError | SignalNotFoundForEscalationCheckError

/**
 * Decide whether an issue's escalation state has transitioned and emit the
 * matching event. The "currently escalating" truth lives on the
 * `alert_incidents` table — joined here via `SignalRepository.findById`'s
 * `lifecycle.isEscalating` flag — and on/off transitions are actuated by
 * emitting `SignalEscalated` / `SignalEscalationEnded`. The downstream
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
export const checkSignalEscalationUseCase = (input: CheckSignalEscalationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const signalRepository = yield* SignalRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const outboxEventWriter = yield* OutboxEventWriter
    const alertIncidentRepository = yield* IncidentRepository
    const settingsReader = yield* SettingsReader
    const sqlClient = yield* SqlClient

    // Read through the gate and skip below, rather than letting a default-deny
    // read 404: the hourly sweeper feeds this path, so a candidate would surface
    // as a failed task instead of a deliberate no-op.
    const signalWithLifecycle = yield* signalRepository
      .findById(SignalId(input.signalId), { includeUnpromoted: true })
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new SignalNotFoundForEscalationCheckError({ signalId: input.signalId })),
        ),
      )

    const wasEscalating = signalWithLifecycle.lifecycle.isEscalating
    const now = new Date()

    // Ignored signals no longer drive escalation transitions — occurrences may
    // keep accruing, but the user opted out of the automated lifecycle. Muted
    // signals ARE still checked: mute is a notification barrier, so incidents
    // open/close normally and only the fan-out is suppressed.
    if (signalWithLifecycle.ignoredAt !== null) {
      return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckSignalEscalationResult
    }

    // A candidate has no user-facing existence, so it cannot open an incident
    // that would route around the promotion gate. Bailing before the engine also
    // strands no open incident: the enforcement migration promoted every signal
    // that existed, and the latch means one can never become unpromoted again.
    if (signalWithLifecycle.promotedAt === null) {
      return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckSignalEscalationResult
    }

    const [projectSettings, openIncident] = yield* Effect.all(
      [
        settingsReader.getProjectSettings(ProjectId(input.projectId)),
        wasEscalating
          ? alertIncidentRepository.findOpen({
              sourceType: "signal",
              sourceId: input.signalId,
            })
          : Effect.succeed(null),
      ],
      { concurrency: "unbounded" },
    )

    const kShort = projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

    const decision = yield* makeEscalationEngine()
      .evaluate({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        sourceId: input.signalId,
        kShort,
        isNew: isSignalNew(signalFirstVisibleAt(signalWithLifecycle), now),
        wasEscalating,
        // Narrow the now-polymorphic snapshot to the seasonal shape.
        entrySignals:
          openIncident && isSignalEscalationEntrySignals(openIncident.entrySignals) ? openIncident.entrySignals : null,
        startedAt: openIncident?.startedAt ?? null,
        exitEligibleSince: openIncident?.exitEligibleSince ?? null,
        now,
      })
      .pipe(Effect.provideService(SeriesReader, makeScoreOccurrenceReader(scoreAnalyticsRepository)))

    if (decision.transition === "enter") {
      yield* sqlClient.transaction(
        Effect.gen(function* () {
          // A resolved signal that re-enters escalation has regressed: reopen
          // it so the archive can't hide an actively escalating signal. The
          // escalation notification announces the recurrence, so no separate
          // SignalRegressed event is emitted on this path. The conditional
          // claim (not a save of the earlier unlocked read) leaves concurrent
          // lifecycle writes intact and can't reopen a just-ignored signal.
          if (signalWithLifecycle.resolvedAt !== null) {
            yield* signalRepository.claimReopenOnOccurrence({
              signalId: SignalId(signalWithLifecycle.id),
              occurredAt: now,
              now,
            })
          }
          yield* outboxEventWriter.write({
            eventName: "SignalEscalated",
            aggregateType: "issue",
            aggregateId: signalWithLifecycle.id,
            organizationId: signalWithLifecycle.organizationId,
            payload: {
              organizationId: signalWithLifecycle.organizationId,
              projectId: signalWithLifecycle.projectId,
              signalId: signalWithLifecycle.id,
              escalatedAt: (decision.transitionAt ?? now).toISOString(),
              entrySignals: decision.entrySignalsSnapshot ?? null,
            },
          })
        }),
      )
      return { transition: "entered", currentlyEscalating: true } satisfies CheckSignalEscalationResult
    }

    if (decision.transition === "exit") {
      yield* outboxEventWriter.write({
        eventName: "SignalEscalationEnded",
        aggregateType: "issue",
        aggregateId: signalWithLifecycle.id,
        organizationId: signalWithLifecycle.organizationId,
        payload: {
          organizationId: signalWithLifecycle.organizationId,
          projectId: signalWithLifecycle.projectId,
          signalId: signalWithLifecycle.id,
          endedAt: (decision.transitionAt ?? now).toISOString(),
          reason: decision.reason ?? "threshold",
        },
      })
      return { transition: "exited", currentlyEscalating: false } satisfies CheckSignalEscalationResult
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

    return { transition: "none", currentlyEscalating: wasEscalating } satisfies CheckSignalEscalationResult
  }).pipe(Effect.withSpan("issues.checkSignalEscalation")) as Effect.Effect<
    CheckSignalEscalationResult,
    CheckSignalEscalationError,
    | SqlClient
    | ChSqlClient
    | SignalRepository
    | ScoreAnalyticsRepository
    | OutboxEventWriter
    | IncidentRepository
    | SettingsReader
  >
