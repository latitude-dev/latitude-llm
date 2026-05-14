import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Notification } from "../entities/notification.ts"

export interface NotificationCursor {
  readonly createdAt: Date
  readonly id: string
}

export interface ListNotificationsInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly limit: number
  readonly cursor?: NotificationCursor
}

export interface ListNotificationsResult {
  readonly items: readonly Notification[]
  readonly nextCursor: NotificationCursor | null
  readonly hasMore: boolean
}

export interface GetUnreadNotificationCountInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
}

export interface MarkAllNotificationsSeenInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly seenAt: Date
}

export interface MarkNotificationSeenInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly notificationId: string
  readonly seenAt: Date
}

export interface NotificationRepositoryShape {
  /**
   * Insert a batch of notification rows. Conflicts on the
   * `(organization_id, user_id, source_id, payload->>'event')` partial unique
   * index (incident notifications) are silently dropped — the create-incident
   * use case relies on this for idempotent outbox redelivery.
   */
  bulkInsert(notifications: readonly Notification[]): Effect.Effect<void, RepositoryError, SqlClient>

  list(input: ListNotificationsInput): Effect.Effect<ListNotificationsResult, RepositoryError, SqlClient>

  countUnread(input: GetUnreadNotificationCountInput): Effect.Effect<number, RepositoryError, SqlClient>

  /**
   * Sets `seen_at` on every unread row for the given user in the given org.
   * Idempotent — re-runs are no-ops once everything is already seen.
   */
  markAllSeen(input: MarkAllNotificationsSeenInput): Effect.Effect<void, RepositoryError, SqlClient>

  /**
   * Sets `seen_at` on a single notification, scoped to the given user + org.
   * Idempotent: the WHERE clause requires `seen_at IS NULL`, so re-marking
   * a seen row is a no-op. Cross-tenant / cross-user calls are silently
   * no-ops (no row matches the WHERE), not errors.
   */
  markSeen(input: MarkNotificationSeenInput): Effect.Effect<void, RepositoryError, SqlClient>
}

export class NotificationRepository extends Context.Service<NotificationRepository, NotificationRepositoryShape>()(
  "@domain/notifications/NotificationRepository",
) {}
