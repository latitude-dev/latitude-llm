import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface MarkNotificationSeenInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly notificationId: string
}

export type MarkNotificationSeenError = RepositoryError

/**
 * Mark a single notification as seen, scoped to the current user + org.
 * Idempotent: the underlying repo's WHERE clause requires `seen_at IS NULL`,
 * so re-marking an already-seen row is a no-op. Calls referencing a
 * notification that belongs to another user / org are silently no-ops too
 * — no row matches the WHERE, no error raised.
 */
export const markNotificationSeenUseCase = (input: MarkNotificationSeenInput) =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    yield* repo.markSeen({ ...input, seenAt: new Date() })
  }).pipe(Effect.withSpan("notifications.markSeen")) as Effect.Effect<
    void,
    MarkNotificationSeenError,
    SqlClient | NotificationRepository
  >
