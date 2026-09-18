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
import { type Signal, SignalRepository } from "@domain/signals"
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
  | {
      readonly status: "skipped"
      readonly reason:
        | "signal-not-found"
        | "user-origin-signal"
        | "signal-muted"
        | "signal-ignored"
        | "signal-resolved"
        | "no-recipients"
    }
  | { readonly status: "ok"; readonly requests: readonly SignalDiscoveredNotificationRequest[] }

export type RequestSignalDiscoveredNotificationsError = RepositoryError

type DiscoveredSignalSkipReason =
  | "signal-not-found"
  | "user-origin-signal"
  | "signal-muted"
  | "signal-ignored"
  | "signal-resolved"

const skipReasonForDiscoveredSignal = (signal: Signal, projectId: ProjectId): DiscoveredSignalSkipReason | null => {
  if (signal.projectId !== projectId) return "signal-not-found"
  if (signal.origin === "user") return "user-origin-signal"
  if (signal.mutedAt !== null) return "signal-muted"
  if (signal.ignoredAt !== null) return "signal-ignored"
  if (signal.resolvedAt !== null) return "signal-resolved"
  return null
}

const resolveDiscoveredRecipients = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly assigneeId: string | null
}) =>
  input.assigneeId
    ? Effect.succeed([UserId(input.assigneeId)] as const)
    : resolveRecipients({
        organizationId: input.organizationId,
        projectId: input.projectId,
        kind: "signal.discovered",
      })

export const requestSignalDiscoveredNotificationsUseCase = (input: RequestSignalDiscoveredNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)

    const signals = yield* SignalRepository
    const signal = yield* signals
      .findById(input.signalId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (signal === null) {
      yield* Effect.annotateCurrentSpan("skipped", "signal-not-found")
      return { status: "skipped", reason: "signal-not-found" } as const
    }
    const skipReason = skipReasonForDiscoveredSignal(signal, input.projectId)
    if (skipReason !== null) {
      yield* Effect.annotateCurrentSpan("skipped", skipReason)
      return { status: "skipped", reason: skipReason } as const
    }

    const hasSignalAssignee = Boolean(signal.assigneeId)
    const recipients = yield* resolveDiscoveredRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      assigneeId: signal.assigneeId,
    })
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
