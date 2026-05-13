import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface MarkAllNotificationsSeenInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
}

export type MarkAllNotificationsSeenError = RepositoryError

/**
 * Mark every unread notification for the current user in this org as seen.
 * Idempotent: re-runs while everything is already seen are no-ops at the
 * SQL level (the partial index narrows the UPDATE to `seen_at IS NULL`).
 */
export const markAllNotificationsSeenUseCase = (input: MarkAllNotificationsSeenInput) =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    yield* repo.markAllSeen({ ...input, seenAt: new Date() })
  }).pipe(Effect.withSpan("notifications.markAllSeen")) as Effect.Effect<
    void,
    MarkAllNotificationsSeenError,
    SqlClient | NotificationRepository
  >
