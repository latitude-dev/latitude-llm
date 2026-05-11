import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface GetUnreadNotificationCountInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
}

export type GetUnreadNotificationCountError = RepositoryError

export const getUnreadNotificationCountUseCase = (input: GetUnreadNotificationCountInput) =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    return yield* repo.countUnread(input)
  }).pipe(Effect.withSpan("notifications.countUnread")) as Effect.Effect<
    number,
    GetUnreadNotificationCountError,
    SqlClient | NotificationRepository
  >
