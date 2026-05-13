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
import type { CustomMessageNotificationPayload, Notification } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface CreateCustomMessageNotificationsInput {
  readonly organizationId: OrganizationId
  /**
   * Optional source identifier (24-char CUID). When provided, the partial
   * unique index on (organization_id, user_id, source_id) gives natural
   * idempotency — re-running for the same source for the same recipient
   * silently dedupes via `onConflictDoNothing`.
   */
  readonly sourceId?: string
  readonly title: string
  readonly content?: string
  /** Absolute URL the notification's "view" action navigates to. */
  readonly link?: string
}

export type CreateCustomMessageNotificationsError = RepositoryError

/**
 * Fan out a freeform notification ("custom_message" type) to every member of
 * an organization. One row per member; `bulkInsert` is the single write.
 *
 * V1 is one-shot — recipients = all org members. Per-user / per-project
 * filtering can be layered later without changing this surface.
 */
export const createCustomMessageNotificationsUseCase = (input: CreateCustomMessageNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    if (input.sourceId) {
      yield* Effect.annotateCurrentSpan("sourceId", input.sourceId)
    }

    const memberships = yield* MembershipRepository
    const rows = yield* memberships.listByOrganizationId(input.organizationId)
    if (rows.length === 0) return { inserted: 0 }

    const payload: CustomMessageNotificationPayload = {
      title: input.title,
      ...(input.content ? { content: input.content } : {}),
      ...(input.link ? { link: input.link } : {}),
    }

    const now = new Date()
    const notifications: Notification[] = rows.map((row) => ({
      id: NotificationId(generateId()),
      organizationId: input.organizationId,
      userId: UserId(row.userId),
      type: "custom_message",
      sourceId: input.sourceId ?? null,
      payload,
      createdAt: now,
      seenAt: null,
    }))

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.bulkInsert(notifications)

    return { inserted: notifications.length }
  }).pipe(Effect.withSpan("notifications.createCustomMessageNotifications")) as Effect.Effect<
    { readonly inserted: number },
    CreateCustomMessageNotificationsError,
    SqlClient | MembershipRepository | NotificationRepository
  >
