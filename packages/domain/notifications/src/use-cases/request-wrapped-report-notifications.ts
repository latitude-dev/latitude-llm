import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type RepositoryError,
  type SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { WrappedReportPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestWrappedReportNotificationsInput {
  readonly organizationId: OrganizationId
  readonly wrappedReportId: string
  readonly projectName: string
  /** Absolute URL to `/wrapped/<id>`. */
  readonly link: string
}

export interface WrappedReportNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "wrapped.report"
  readonly idempotencyKey: string
  readonly payload: WrappedReportPayload
  readonly notificationId: NotificationId
}

export type RequestWrappedReportNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly WrappedReportNotificationRequest[] }

export type RequestWrappedReportNotificationsError = RepositoryError

/**
 * Producer step for `wrapped.report` notifications. No project-level gate
 * (Wrapped is opt-in at the feature-flag layer; users who get it get
 * notified). Resolves recipients and returns one request per member; the
 * caller publishes them to the queue.
 */
export const requestWrappedReportNotificationsUseCase = (input: RequestWrappedReportNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("wrappedReportId", input.wrappedReportId)

    const recipients = yield* resolveRecipients({
      organizationId: input.organizationId,
      projectId: undefined,
      kind: undefined,
    })

    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: WrappedReportPayload = {
      wrappedReportId: input.wrappedReportId,
      projectName: input.projectName,
      link: input.link,
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "wrapped.report", payload })

    const requests: WrappedReportNotificationRequest[] = recipients.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      kind: "wrapped.report" as const,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestWrappedReportNotifications")) as Effect.Effect<
    RequestWrappedReportNotificationsResult,
    RequestWrappedReportNotificationsError,
    SqlClient | MembershipRepository
  >
