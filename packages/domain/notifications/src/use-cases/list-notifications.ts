import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import {
  type ListNotificationsResult,
  type NotificationCursor,
  NotificationRepository,
} from "../ports/notification-repository.ts"

export interface ListNotificationsInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly limit: number
  readonly cursor?: NotificationCursor
}

export type ListNotificationsError = RepositoryError

/**
 * Return a cursor-paginated page of the current user's notifications in the
 * given org, most-recent first. New notifications landing at the top while
 * the user pages don't shift older pages.
 */
export const listNotificationsUseCase = (input: ListNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("userId", input.userId)
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("limit", input.limit)

    const repo = yield* NotificationRepository
    return yield* repo.list({
      organizationId: input.organizationId,
      userId: input.userId,
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    })
  }).pipe(Effect.withSpan("notifications.list")) as Effect.Effect<
    ListNotificationsResult,
    ListNotificationsError,
    SqlClient | NotificationRepository
  >
