import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface MarkNotificationSeenInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly notificationId: string
}

export type MarkNotificationSeenError = RepositoryError

// Idempotent + ownership-scoped via the repo's WHERE clause; cross-tenant/user calls are silent no-ops.
export const markNotificationSeenUseCase = (input: MarkNotificationSeenInput) =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    yield* repo.markSeen({ ...input, seenAt: new Date() })
  }).pipe(Effect.withSpan("notifications.markSeen")) as Effect.Effect<
    void,
    MarkNotificationSeenError,
    SqlClient | NotificationRepository
  >
