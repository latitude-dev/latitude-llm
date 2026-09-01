import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type ScoreId,
  type SignalId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import type { SignalRegressedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestSignalRegressedNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly regressedAt: string
  readonly triggerScoreId: ScoreId
}

export interface SignalRegressedNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "signal.regressed"
  readonly idempotencyKey: string
  readonly payload: SignalRegressedPayload
  readonly notificationId: NotificationId
  readonly projectId: ProjectId
  readonly slackEligible: boolean
}

export type RequestSignalRegressedNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "signal-not-found" | "muted" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly SignalRegressedNotificationRequest[] }

export type RequestSignalRegressedNotificationsError = RepositoryError

/**
 * Producer step for the regression notification: a new occurrence reopened a
 * manually resolved signal. Mute is the notification barrier — a muted
 * signal's regression reopens the row (the event already fired) but fans out
 * to nobody. The assignee, when present, is the sole recipient; otherwise the
 * project's incident-notification recipients are resolved like discovery.
 */
export const requestSignalRegressedNotificationsUseCase = (input: RequestSignalRegressedNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)

    const signals = yield* SignalRepository
    const signal = yield* signals
      .findById(input.signalId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (signal === null || signal.projectId !== input.projectId) {
      yield* Effect.annotateCurrentSpan("skipped", "signal-not-found")
      return { status: "skipped", reason: "signal-not-found" } as const
    }
    if (signal.mutedAt !== null) {
      yield* Effect.annotateCurrentSpan("skipped", "muted")
      return { status: "skipped", reason: "muted" } as const
    }

    const hasSignalAssignee = Boolean(signal.assigneeId)
    let recipients: readonly UserId[]
    if (signal.assigneeId) {
      recipients = [UserId(signal.assigneeId)]
    } else {
      recipients = yield* resolveRecipients({
        organizationId: input.organizationId,
        projectId: input.projectId,
        kind: "signal.regressed",
      })
    }
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: SignalRegressedPayload = {
      signalId: input.signalId,
      regressedAt: input.regressedAt,
      triggerScoreId: input.triggerScoreId,
      ...(signal.priority === null ? {} : { severity: signal.priority }),
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "signal.regressed", payload })
    const requests = recipients.map(
      (userId): SignalRegressedNotificationRequest => ({
        organizationId: input.organizationId,
        userId: UserId(userId),
        kind: "signal.regressed",
        idempotencyKey,
        payload,
        notificationId: NotificationId(generateId()),
        projectId: input.projectId,
        slackEligible: !hasSignalAssignee,
      }),
    )

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestSignalRegressedNotifications")) as Effect.Effect<
    RequestSignalRegressedNotificationsResult,
    RequestSignalRegressedNotificationsError,
    SqlClient | SignalRepository | MembershipRepository
  >
