import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SignalId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import type { SignalDiscoveredPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestSignalDiscoveredNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly discoveredAt: string
}

export interface SignalDiscoveredNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "signal.discovered"
  readonly idempotencyKey: string
  readonly payload: SignalDiscoveredPayload
  readonly notificationId: NotificationId
  readonly projectId: ProjectId
  readonly slackEligible: boolean
}

export type RequestSignalDiscoveredNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "signal-not-found" | "user-origin-signal" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly SignalDiscoveredNotificationRequest[] }

export type RequestSignalDiscoveredNotificationsError = RepositoryError

export const requestSignalDiscoveredNotificationsUseCase = (input: RequestSignalDiscoveredNotificationsInput) =>
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
    if (signal.origin === "user") {
      yield* Effect.annotateCurrentSpan("skipped", "user-origin-signal")
      return { status: "skipped", reason: "user-origin-signal" } as const
    }

    const hasSignalAssignee = Boolean(signal.assigneeId)
    let recipients: readonly UserId[]
    if (signal.assigneeId) {
      recipients = [UserId(signal.assigneeId)]
    } else {
      recipients = yield* resolveRecipients({
        organizationId: input.organizationId,
        projectId: input.projectId,
        kind: "signal.discovered",
      })
    }
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: SignalDiscoveredPayload = {
      signalId: input.signalId,
      discoveredAt: input.discoveredAt,
      ...(signal.priority === null ? {} : { severity: signal.priority }),
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "signal.discovered", payload })
    const requests = recipients.map(
      (userId): SignalDiscoveredNotificationRequest => ({
        organizationId: input.organizationId,
        userId: UserId(userId),
        kind: "signal.discovered",
        idempotencyKey,
        payload,
        notificationId: NotificationId(generateId()),
        projectId: input.projectId,
        slackEligible: !hasSignalAssignee,
      }),
    )

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestSignalDiscoveredNotifications")) as Effect.Effect<
    RequestSignalDiscoveredNotificationsResult,
    RequestSignalDiscoveredNotificationsError,
    SqlClient | SignalRepository | MembershipRepository
  >
