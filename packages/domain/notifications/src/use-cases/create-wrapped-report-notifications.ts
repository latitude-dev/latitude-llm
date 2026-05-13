import { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type RepositoryError,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { Notification, WrappedReportNotificationPayload } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface CreateWrappedReportNotificationsInput {
  readonly organizationId: OrganizationId
  /**
   * The persisted Wrapped report id (CUID). Stored in `sourceId` so the
   * notifications table's partial unique index dedupes re-deliveries —
   * BullMQ retries of the same `create-from-wrapped-report` task won't
   * double up notifications per user.
   */
  readonly wrappedReportId: string
  readonly projectName: string
  /** Absolute URL to `/wrapped/<id>`. */
  readonly link: string
}

export type CreateWrappedReportNotificationsError = RepositoryError

/**
 * Fan out a `wrapped_report` notification to every member of an
 * organization. One row per member; `bulkInsert` is the single write.
 *
 * Mirrors the shape of `createIncidentNotificationsUseCase` (broadcast +
 * dedupe via `sourceId`) but stays scoped to Wrapped data so the renderer
 * on the web side gets a typed payload rather than the loose
 * `custom_message` shape.
 */
export const createWrappedReportNotificationsUseCase = (input: CreateWrappedReportNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("wrappedReportId", input.wrappedReportId)

    const memberships = yield* MembershipRepository
    const rows = yield* memberships.listByOrganizationId(input.organizationId)
    if (rows.length === 0) return { inserted: 0 }

    const payload: WrappedReportNotificationPayload = {
      projectName: input.projectName,
      link: input.link,
    }

    const now = new Date()
    const notifications: Notification[] = rows.map((row) => ({
      id: NotificationId(generateId()),
      organizationId: input.organizationId,
      userId: UserId(row.userId),
      type: "wrapped_report",
      sourceId: input.wrappedReportId,
      payload,
      createdAt: now,
      seenAt: null,
    }))

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.bulkInsert(notifications)

    return { inserted: notifications.length }
  }).pipe(Effect.withSpan("notifications.createWrappedReportNotifications")) as Effect.Effect<
    { readonly inserted: number },
    CreateWrappedReportNotificationsError,
    SqlClient | MembershipRepository | NotificationRepository
  >
