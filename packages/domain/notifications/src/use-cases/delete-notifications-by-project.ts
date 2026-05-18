import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface DeleteNotificationsByProjectInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export type DeleteNotificationsByProjectError = RepositoryError

/**
 * Cascade cleanup invoked by the `ProjectDeleted` domain event. Removes
 * every notification anchored to the project from the bell feed across
 * all users. We don't keep tombstones — once the project is gone, its
 * incident / wrapped-report notifications are irrelevant.
 *
 * Idempotent: re-runs hit zero rows and return `{ deleted: 0 }`.
 */
export const deleteNotificationsByProjectUseCase = (input: DeleteNotificationsByProjectInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const repo = yield* NotificationRepository
    return yield* repo.deleteByProjectId(input)
  }).pipe(Effect.withSpan("notifications.deleteByProject")) as Effect.Effect<
    { readonly deleted: number },
    DeleteNotificationsByProjectError,
    SqlClient | NotificationRepository
  >
