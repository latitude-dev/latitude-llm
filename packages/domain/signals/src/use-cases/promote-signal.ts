import { OutboxEventWriter } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import {
  type CacheError,
  type CacheStore,
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SignalId,
  SqlClient,
} from "@domain/shared"
import type { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import { PROMOTION_WINDOW_DAYS } from "../constants.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { promotionThresholdForVolume } from "../promotion.ts"
import { type GenerateSignalDetailsError, generateSignalDetailsUseCase } from "./generate-signal-details.ts"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface PromoteSignalInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  /**
   * Whether to generate the cluster summary before stamping. The caller clears
   * it when billing refused the call or the metering scope could not be built:
   * the AI layer resolves that scope through `Effect.serviceOption`, so
   * generating without one runs the model unmetered. Promotion still happens,
   * under the placeholder.
   */
  readonly generateDetails?: boolean
}

export type PromoteSignalResult = {
  readonly signalId: string
  readonly action: "promoted" | "already-promoted" | "not-qualified" | "not-found"
}

export type PromoteSignalError = CacheError | RepositoryError | GenerateSignalDetailsError

const resolvePromotionThreshold = (input: PromoteSignalInput, at: Date) =>
  Effect.gen(function* () {
    const volume = yield* resolveProjectSessionVolumeUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      now: at,
    })
    const threshold = promotionThresholdForVolume(volume)

    yield* Effect.annotateCurrentSpan("promotion.volume", volume ?? -1)
    yield* Effect.annotateCurrentSpan("promotion.volumeDegraded", volume === null)
    yield* Effect.annotateCurrentSpan("promotion.threshold", threshold)

    return threshold
  })

const countPromotionSessions = (input: {
  readonly projectId: string
  readonly signalId: SignalId
  readonly at: Date
}) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    return yield* scoreRepository.countDistinctSessionsBySignalId({
      projectId: ProjectId(input.projectId),
      signalId: input.signalId,
      since: new Date(input.at.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    })
  })

/**
 * Stamps `promoted_at` and emits `SignalPromoted`, after replacing the
 * candidate's placeholder with a summary of its whole cluster.
 *
 * Naming happens here rather than after promotion so a signal is never visible
 * carrying the raw feedback sentence it was created from, and never announced
 * under one: agent dispatch builds its prompt from the name and description, and
 * Slack renders once at send time. Both the generation and the latch belong to
 * this step, which is why the gate that decides promotion does not stamp it —
 * `assignScoreToSignalUseCase` only records that the evidence was reached.
 *
 * Generation failure must not block promotion. A signal promoted under its
 * placeholder is corrected by the throttled `signals:refresh`, which runs for it
 * now that the latch is set; a signal held back because a model call failed is
 * invisible to everyone with nothing scheduled to retry it.
 */
export const promoteSignalUseCase = (input: PromoteSignalInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const signals = yield* SignalRepository
    const existing = yield* signals.findById(SignalId(input.signalId), { includeUnpromoted: true }).pipe(
      Effect.map((signal) => ({ action: "found", signal }) as const),
      Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
    )

    if (existing.action === "not-found") {
      return { action: "not-found", signalId: input.signalId } satisfies PromoteSignalResult
    }
    if (existing.signal.promotedAt !== null) {
      return { action: "already-promoted", signalId: input.signalId } satisfies PromoteSignalResult
    }

    const at = new Date()
    const threshold = yield* resolvePromotionThreshold(input, at)
    const sessions = yield* countPromotionSessions({
      projectId: existing.signal.projectId,
      signalId: existing.signal.id,
      at,
    })
    yield* Effect.annotateCurrentSpan("promotion.sessions", sessions)
    yield* Effect.annotateCurrentSpan("promotion.qualified", sessions >= threshold)
    if (sessions < threshold) {
      return { action: "not-qualified", signalId: input.signalId } satisfies PromoteSignalResult
    }

    // Generated before the transaction opens, and read straight from
    // `generateSignalDetailsUseCase` rather than through `refreshSignalDetails`:
    // that one returns early for an unpromoted signal, which is every signal
    // reaching this point.
    const details =
      input.generateDetails === false
        ? null
        : yield* generateSignalDetailsUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalId: input.signalId,
            ignorePreviousDetails: true,
          }).pipe(
            Effect.map((generated) => ({ name: generated.name, description: generated.description })),
            // `catchCause`, not `catch`: a provider that throws surfaces as a
            // defect rather than an `AIError`, and a defect must not hold
            // promotion back any more than a typed failure does.
            Effect.catchCause(() => Effect.succeed(null)),
          )

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const locked = yield* signalRepository.findByIdForUpdate(SignalId(input.signalId)).pipe(
          Effect.map((signal) => ({ action: "found", signal }) as const),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
        )

        if (locked.action === "not-found") {
          return { action: "not-found", signalId: input.signalId } satisfies PromoteSignalResult
        }
        if (locked.signal.promotedAt !== null) {
          return { action: "already-promoted", signalId: input.signalId } satisfies PromoteSignalResult
        }

        // Re-count here: a delayed SignalQualifiedForPromotion job can fire after the evidence was removed.
        const lockedSessions = yield* countPromotionSessions({
          projectId: locked.signal.projectId,
          signalId: locked.signal.id,
          at: new Date(),
        })
        if (lockedSessions < threshold) {
          return { action: "not-qualified", signalId: input.signalId } satisfies PromoteSignalResult
        }

        const promotedAt = new Date()
        yield* signalRepository.save({
          ...locked.signal,
          ...(details ?? {}),
          promotedAt,
          updatedAt: promotedAt,
        })
        yield* outboxEventWriter.write({
          eventName: "SignalPromoted",
          aggregateType: "issue",
          aggregateId: locked.signal.id,
          organizationId: locked.signal.organizationId,
          payload: {
            organizationId: locked.signal.organizationId,
            projectId: locked.signal.projectId,
            signalId: locked.signal.id,
            promotedAt: promotedAt.toISOString(),
          },
        })

        yield* Effect.annotateCurrentSpan("promotion.named", details !== null)

        return { action: "promoted", signalId: locked.signal.id } satisfies PromoteSignalResult
      }),
    )
  }).pipe(Effect.withSpan("issues.promoteSignal")) as Effect.Effect<
    PromoteSignalResult,
    PromoteSignalError,
    CacheStore | ChSqlClient | SessionRepository
  >
