import type {
  NotFoundError,
  NotificationId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
  UserId,
} from "@domain/shared"
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
   * Insert a row, deduping on the `(organization_id, user_id,
   * idempotency_key)` unique index. Returns the inserted row, or `null`
   * when the conflict path silently dropped the insert (outbox redelivery
   * — the row already exists).
   */
  insertIfAbsent(row: Notification): Effect.Effect<Notification | null, RepositoryError, SqlClient>

  /** Used by the email worker to fetch the row before rendering. */
  findById(id: NotificationId): Effect.Effect<Notification, NotFoundError | RepositoryError, SqlClient>

  /**
   * Conditionally stamp `emailed_at = now()` on a row, scoped to
   * `WHERE emailed_at IS NULL`. Returns `true` when we won the race and
   * are the one who should send the email; `false` when another delivery
   * (or a retry) already stamped it.
   */
  markEmailed(id: NotificationId): Effect.Effect<boolean, RepositoryError, SqlClient>

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

  /**
   * Cascade cleanup. Removes every notification anchored to the given
   * project across all users of the (current RLS-scoped) organization.
   * Called by the `ProjectDeleted` domain-event handler — per the
   * platform's no-FK rule, referential integrity for `project_id` is
   * application-layer.
   */
  deleteByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
  }): Effect.Effect<{ readonly deleted: number }, RepositoryError, SqlClient>
}

export class NotificationRepository extends Context.Service<NotificationRepository, NotificationRepositoryShape>()(
  "@domain/notifications/NotificationRepository",
) {}
