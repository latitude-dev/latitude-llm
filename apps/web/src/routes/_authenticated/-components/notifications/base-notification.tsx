import { cn, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useRef } from "react"
import {
  markNotificationSeen,
  type NotificationRecord,
} from "../../../../domains/notifications/notifications.functions.ts"
import { useNotificationFeed } from "./notification-feed-context.tsx"
import { LIST_QUERY_KEY, UNREAD_QUERY_KEY } from "./notification-query-keys.ts"

const HOVER_MARK_SEEN_DEBOUNCE_MS = 400

interface BaseNotificationProps {
  /**
   * Notification id, used to fire per-row `markNotificationSeen` on hover /
   * focus / click. `undefined` for synthetic / fallback cards where there's
   * no real row to mark — those rows just don't wire the mark-seen handlers.
   */
  readonly notificationId?: string
  readonly seenAt: Date | undefined
  readonly createdAt: Date
  readonly icon?: ReactNode
  readonly title?: ReactNode
  readonly description?: ReactNode
  readonly url?: string | undefined
  readonly children?: ReactNode
}

/**
 * A notification is "unseen for this popover open" when either:
 *   - it has never been seen (`seenAt === undefined`), or
 *   - its `seenAt` is newer than the timestamp captured when the popover
 *     opened (i.e. it was just marked seen during this open — by hover, click,
 *     or "Mark all as read" — but should still visually read as unseen until
 *     the user closes & reopens the popover).
 *
 * Without an active feed context (`openedAt === null`) we treat everything
 * as seen — there's no "this open" to compare against.
 */
function computeIsUnseen(seenAt: Date | undefined, openedAt: Date | null): boolean {
  if (openedAt === null) return false
  if (seenAt === undefined) return true
  return seenAt > openedAt
}

type ListPage = {
  readonly items: readonly NotificationRecord[]
  readonly hasMore: boolean
  readonly nextCursor: unknown
}
type ListData = { readonly pages: readonly ListPage[]; readonly pageParams: readonly unknown[] }

/**
 * Hover / focus / click handlers that fire `markNotificationSeen` for a
 * single row after a short debounce. Quick mouse passes don't mark items —
 * the user has to linger ~400ms (or click through, which fires immediately
 * and also covers touch devices). The first POST sets `firedRef` so
 * re-hovering doesn't churn the server.
 *
 * Optimistic update patches the cached list (sets `seenAt`) and decrements
 * the unread count so the badge updates instantly; `onSettled` invalidates
 * both keys so the next refetch reconciles with the server.
 */
function useMarkSeenOnHover(notificationId: string | undefined, seenAt: Date | undefined) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const mutation = useMutation({
    mutationFn: (id: string) => markNotificationSeen({ data: { notificationId: id } }),
    onMutate: (id) => {
      const now = new Date().toISOString()
      queryClient.setQueryData<ListData>(LIST_QUERY_KEY, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id && item.seenAt === null ? { ...item, seenAt: now } : item)),
          })),
        }
      })
      queryClient.setQueryData<{ readonly count: number }>(UNREAD_QUERY_KEY, (old) => ({
        count: Math.max(0, (old?.count ?? 0) - 1),
      }))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
    },
  })

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Clear the pending timer if the row unmounts (popover closed mid-debounce).
  useEffect(() => clearTimer, [])

  const canMark = notificationId !== undefined && seenAt === undefined

  const scheduleMark = () => {
    if (!canMark || firedRef.current || timerRef.current !== null) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (firedRef.current) return
      firedRef.current = true
      mutation.mutate(notificationId)
    }, HOVER_MARK_SEEN_DEBOUNCE_MS)
  }

  const fireNow = () => {
    clearTimer()
    if (!canMark || firedRef.current) return
    firedRef.current = true
    mutation.mutate(notificationId)
  }

  return {
    onPointerEnter: scheduleMark,
    onPointerLeave: clearTimer,
    onFocus: scheduleMark,
    onBlur: clearTimer,
    onClick: fireNow,
  }
}

const cardClasses =
  "relative flex w-full flex-row items-start gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"

function BaseNotificationContent({
  seenAt,
  createdAt,
  icon,
  title,
  description,
  children,
}: Omit<BaseNotificationProps, "url" | "notificationId">) {
  const { openedAt } = useNotificationFeed()
  const isUnseen = computeIsUnseen(seenAt, openedAt)

  return (
    <>
      {icon ? (
        <div
          className={cn("w-8 h-8 rounded-lg flex shrink-0 items-center justify-center", {
            "bg-muted text-muted-foreground": !isUnseen,
            "bg-accent text-primary": isUnseen,
          })}
        >
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? typeof title === "string" ? <Text.H5>{title}</Text.H5> : title : null}
        {description ? (
          typeof description === "string" ? (
            <Text.H6 color="foregroundMuted">{description}</Text.H6>
          ) : (
            description
          )
        ) : null}
        {children}
        {/* Timestamp anchored at the bottom of the body column — separates
            meta-info from the content above and keeps the title row free to
            wrap naturally without competing for horizontal space. */}
        <Text.H6 color="foregroundMuted" className="pt-1" noWrap>
          {relativeTime(createdAt)}
        </Text.H6>
      </div>
      {isUnseen && <div aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
    </>
  )
}

/**
 * Card-like row used by every per-type notification renderer in the bell
 * popover. Provides shared affordances — hover background, padding, optional
 * left icon — and routes the whole card through the TanStack `Link` when a
 * `url` is supplied so navigation stays SPA-internal.
 *
 * Hover / focus on an unread row fires `markNotificationSeen` after a 400ms
 * debounce; clicking through (when `url` is set) fires it immediately. The
 * no-url variant is used for parse-fail / placeholder rows that aren't
 * actionable, so we don't add a `tabIndex` — mouse-hover marking still works
 * there, and keyboard users skip them like any other static content.
 */
export function BaseNotification({
  notificationId,
  seenAt,
  createdAt,
  icon,
  title,
  description,
  url,
  children,
}: BaseNotificationProps) {
  const handlers = useMarkSeenOnHover(notificationId, seenAt)
  const content = (
    <BaseNotificationContent seenAt={seenAt} createdAt={createdAt} icon={icon} title={title} description={description}>
      {children}
    </BaseNotificationContent>
  )

  if (url) {
    return (
      <Link to={url} className={cardClasses} {...handlers}>
        {content}
      </Link>
    )
  }

  return (
    <div className={cardClasses} {...handlers}>
      {content}
    </div>
  )
}
