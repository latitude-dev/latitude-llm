import { Effect } from "effect"
import type { Notification } from "../entities/notification.ts"
import type {
  GetUnreadNotificationCountInput,
  ListNotificationsInput,
  ListNotificationsResult,
  MarkAllNotificationsSeenInput,
  NotificationRepositoryShape,
} from "../ports/notification-repository.ts"

/**
 * Minimal in-memory NotificationRepository for unit tests. Mirrors the
 * partial-unique-index dedupe behaviour of the real repo: bulkInsert keys on
 * `(organizationId, userId, sourceId, payload.event)` for type=incident rows
 * and silently drops conflicts.
 */
export const createFakeNotificationRepository = () => {
  const rows: Notification[] = []

  const dedupeKey = (n: Notification): string | null => {
    if (n.type !== "incident" || n.sourceId === null) return null
    const event = (n.payload as { event?: string }).event ?? ""
    return `${n.organizationId}:${n.userId}:${n.sourceId}:${event}`
  }

  const repo: NotificationRepositoryShape = {
    bulkInsert: (incoming) =>
      Effect.sync(() => {
        const seen = new Set(rows.map(dedupeKey).filter((k): k is string => k !== null))
        for (const n of incoming) {
          const key = dedupeKey(n)
          if (key !== null && seen.has(key)) continue
          if (key !== null) seen.add(key)
          rows.push(n)
        }
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
  }

  return { repo, rows }
}
