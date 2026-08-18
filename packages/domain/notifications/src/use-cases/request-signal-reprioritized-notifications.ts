import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  isSeverityIncrease,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SignalId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { type SignalPriority, SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import type { SignalReprioritizedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestSignalReprioritizedNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly priority: SignalPriority | null
  readonly previousPriority: SignalPriority | null
  readonly actorUserId: string
  readonly reprioritizedAt: string
}

export interface SignalReprioritizedNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "signal.reprioritized"
  readonly idempotencyKey: string
  readonly payload: SignalReprioritizedPayload
  readonly notificationId: NotificationId
  readonly projectId: ProjectId
}

/**
 * Channel-scoped view of the same occurrence. Slack posts once per
 * `(occurrence, route)` regardless of recipient count, so it must not ride on
 * `requests`: the actor is filtered out of those, and in a single-member
 * organization that leaves none while the channel still wants the message.
 * `notificationId` is null when no in-app row was written for it to deep-link.
 */
export interface SignalReprioritizedSlackOccurrence {
  readonly organizationId: OrganizationId
  readonly kind: "signal.reprioritized"
  readonly idempotencyKey: string
  readonly payload: SignalReprioritizedPayload
  readonly projectId: ProjectId
  readonly notificationId: NotificationId | null
}

export type RequestSignalReprioritizedNotificationsResult =
  | {
      readonly status: "skipped"
      readonly reason: "signal-not-found" | "muted" | "not-an-increase"
    }
  | {
      readonly status: "ok"
      readonly requests: readonly SignalReprioritizedNotificationRequest[]
      readonly slackOccurrence: SignalReprioritizedSlackOccurrence
    }

export type RequestSignalReprioritizedNotificationsError = RepositoryError

/**
 * Producer step for a priority increase. `SignalReprioritized` is only emitted
 * for increases, but the rule is re-checked here because this is its testable
 * home (mirrors the assignee producer re-checking the router's skips). The
 * priorities carried by the event are the ones that were written, not the
 * signal's current values — a later edit is its own event, so re-reading the
 * row would make a burst of edits all announce the newest value. Mute is the
 * notification barrier, as with regression. The actor is dropped from the
 * recipient fan-out — they just made the edit — but never from the Slack
 * occurrence, which is channel-scoped rather than per-recipient.
 */
export const requestSignalReprioritizedNotificationsUseCase = (input: RequestSignalReprioritizedNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)

    if (!isSeverityIncrease(input.previousPriority, input.priority)) {
      yield* Effect.annotateCurrentSpan("skipped", "not-an-increase")
      return { status: "skipped", reason: "not-an-increase" } as const
    }

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

    const members = yield* resolveRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: "signal.reprioritized",
    })
    const recipients = members.filter((userId) => userId !== input.actorUserId)

    const payload: SignalReprioritizedPayload = {
      signalId: input.signalId,
      actorUserId: input.actorUserId,
      reprioritizedAt: input.reprioritizedAt,
      priority: input.priority,
      previousPriority: input.previousPriority,
      severity: input.priority,
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "signal.reprioritized", payload })
    const requests = recipients.map(
      (userId): SignalReprioritizedNotificationRequest => ({
        organizationId: input.organizationId,
        userId: UserId(userId),
        kind: "signal.reprioritized",
        idempotencyKey,
        payload,
        notificationId: NotificationId(generateId()),
        projectId: input.projectId,
      }),
    )

    return {
      status: "ok",
      requests,
      slackOccurrence: {
        organizationId: input.organizationId,
        kind: "signal.reprioritized",
        idempotencyKey,
        payload,
        projectId: input.projectId,
        notificationId: requests[0]?.notificationId ?? null,
      },
    } as const
  }).pipe(Effect.withSpan("notifications.requestSignalReprioritizedNotifications")) as Effect.Effect<
    RequestSignalReprioritizedNotificationsResult,
    RequestSignalReprioritizedNotificationsError,
    SqlClient | SignalRepository | MembershipRepository
  >
