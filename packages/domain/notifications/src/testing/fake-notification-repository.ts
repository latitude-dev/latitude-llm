import { NotFoundError, type NotificationId } from "@domain/shared"
import { Effect } from "effect"
import type { Notification } from "../entities/notification.ts"
import type {
  GetUnreadNotificationCountInput,
  ListNotificationsInput,
  ListNotificationsResult,
  MarkAllNotificationsSeenInput,
  MarkNotificationSeenInput,
  NotificationRepositoryShape,
} from "../ports/notification-repository.ts"

/**
 * Minimal in-memory NotificationRepository for unit tests. Mirrors the
 * real repo's unique-index dedupe behaviour: `insertIfAbsent` keys on
 * `(organizationId, userId, idempotencyKey)` and returns `null` on
 * conflict instead of throwing. `markEmailed` is a conditional stamp on
 * `emailed_at IS NULL` returning whether we claimed.
 */
export const createFakeNotificationRepository = () => {
  const rows: Notification[] = []
  const keyOf = (n: Notification) => `${n.organizationId}:${n.userId}:${n.idempotencyKey}`

  const repo: NotificationRepositoryShape = {
    insertIfAbsent: (row) =>
      Effect.sync(() => {
        const existing = rows.find((r) => keyOf(r) === keyOf(row))
        if (existing) return null
        rows.push(row)
        return row
      }),
    findById: (id: NotificationId) =>
      Effect.suspend(() => {
        const row = rows.find((r) => r.id === id)
        return row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: "Notification", id }))
      }),
    markEmailed: (id: NotificationId) =>
      Effect.sync(() => {
        const row = rows.find((r) => r.id === id)
        if (!row || row.emailedAt !== null) return false
        ;(row as { emailedAt: Date | null }).emailedAt = new Date()
        return true
      }),
    list: ({ organizationId, userId, limit, cursor }: ListNotificationsInput) =>
      Effect.sync<ListNotificationsResult>(() => {
        const filtered = rows
          .filter((r) => r.organizationId === organizationId && r.userId === userId)
          .filter((r) => {
            if (!cursor) return true
            if (r.createdAt.getTime() !== cursor.createdAt.getTime()) {
              return r.createdAt.getTime() < cursor.createdAt.getTime()
            }
            return r.id < cursor.id
          })
          .sort((a, b) => {
            if (b.createdAt.getTime() !== a.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime()
            return b.id < a.id ? -1 : b.id > a.id ? 1 : 0
          })
        const page = filtered.slice(0, limit)
        const hasMore = filtered.length > limit
        const last = page[page.length - 1]
        return {
          items: page,
          hasMore,
          nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
        }
      }),
    countUnread: ({ organizationId, userId }: GetUnreadNotificationCountInput) =>
      Effect.sync(
        () =>
          rows.filter((r) => r.organizationId === organizationId && r.userId === userId && r.seenAt === null).length,
      ),
    markAllSeen: ({ organizationId, userId, seenAt }: MarkAllNotificationsSeenInput) =>
      Effect.sync(() => {
        for (const r of rows) {
          if (r.organizationId === organizationId && r.userId === userId && r.seenAt === null) {
            ;(r as { seenAt: Date | null }).seenAt = seenAt
          }
        }
      }),
    markSeen: ({ organizationId, userId, notificationId, seenAt }: MarkNotificationSeenInput) =>
      Effect.sync(() => {
        for (const r of rows) {
          if (
            r.id === notificationId &&
            r.organizationId === organizationId &&
            r.userId === userId &&
            r.seenAt === null
          ) {
            ;(r as { seenAt: Date | null }).seenAt = seenAt
          }
        }
      }),
  }

  return { repo, rows }
}
