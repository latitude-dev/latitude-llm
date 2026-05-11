import { Button, Icon, Popover, PopoverContent, PopoverTrigger, Skeleton, Text, useMountEffect } from "@repo/ui"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { useRef, useState } from "react"
import { hasFeatureFlag } from "../../../../domains/feature-flags/feature-flags.functions.ts"
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsSeen,
} from "../../../../domains/notifications/notifications.functions.ts"
import { NotificationFeedProvider } from "./notification-feed-context.tsx"
import { NotificationItem } from "./notification-item.tsx"

const NOTIFICATIONS_FEATURE_FLAG = "notifications"
const PAGE_SIZE = 5
const UNREAD_COUNT_REFETCH_INTERVAL_MS = 60_000
const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const
const UNREAD_QUERY_KEY = [...NOTIFICATIONS_QUERY_KEY, "unread-count"] as const
const LIST_QUERY_KEY = [...NOTIFICATIONS_QUERY_KEY, "list", PAGE_SIZE] as const

function formatBadgeCount(count: number): string {
  if (count > 9) return "9+"
  return String(count)
}

export function NotificationBell() {
  const { data: enabled = false } = useQuery({
    queryKey: ["feature-flag", NOTIFICATIONS_FEATURE_FLAG],
    queryFn: () => hasFeatureFlag({ data: { identifier: NOTIFICATIONS_FEATURE_FLAG } }),
  })

  if (!enabled) return null
  return <NotificationBellEnabled />
}

function NotificationBellEnabled() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState<Date | null>(null)

  const { data: unreadData } = useQuery({
    queryKey: UNREAD_QUERY_KEY,
    queryFn: () => getUnreadNotificationCount(),
    refetchInterval: UNREAD_COUNT_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
  const unread = unreadData?.count ?? 0

  const markSeen = useMutation({
    mutationFn: () => markAllNotificationsSeen(),
    onMutate: () => queryClient.setQueryData(UNREAD_QUERY_KEY, { count: 0 }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY })
    },
  })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          // Snapshot when this open started so the feed can decide which rows
          // to render as "unseen for this open" vs "seen on a previous open".
          // Reset every open so the highlight state is fresh each time.
          setOpenedAt(new Date())
          // Mark everything seen as soon as the popover opens. Skip when
          // there's nothing to mark so we don't churn the server with
          // no-op POSTs on every re-open. Event handler instead of effect
          // — per the web-frontend skill, effects shouldn't be used as
          // command dispatchers.
          if (unread > 0) markSeen.mutate()
        } else {
          // Discard cached pages so reopening starts fresh from the top.
          queryClient.removeQueries({ queryKey: LIST_QUERY_KEY })
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          title="Notifications"
          className="relative h-8 w-8 group-hover:text-foreground"
        >
          <Icon icon={Bell} size="sm" />
          {unread > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 inline-flex h-4 min-w-4 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-background"
            >
              {formatBadgeCount(unread)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[360px] p-0">
        {open ? (
          <NotificationFeedProvider value={{ openedAt }}>
            <NotificationFeed />
          </NotificationFeedProvider>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function NotificationFeed() {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: LIST_QUERY_KEY,
    initialPageParam: undefined as { createdAt: string; id: string } | undefined,
    queryFn: ({ pageParam }) =>
      listNotifications({
        data: { limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  })

  // Infinite scroll inside the popover — fetch the next page when the sentinel
  // at the list bottom enters view. Use `useMountEffect` per the web-frontend
  // skill: the IntersectionObserver is a one-time subscribe-to-external-system.
  // The callback reads the latest query state through a ref so we don't
  // re-wire the observer every time TanStack Query updates.
  const latestQueryStateRef = useRef({ fetchNextPage, hasNextPage, isFetchingNextPage })
  latestQueryStateRef.current = { fetchNextPage, hasNextPage, isFetchingNextPage }
  useMountEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const state = latestQueryStateRef.current
          if (entry.isIntersecting && state.hasNextPage && !state.isFetchingNextPage) {
            void state.fetchNextPage()
          }
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-4">
        <Text.H6 color="foregroundMuted">Couldn't load notifications.</Text.H6>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const items = data?.pages.flatMap((p) => p.items) ?? []
  if (items.length === 0) {
    return (
      <div className="p-4">
        <Text.H6 color="foregroundMuted">No notifications yet</Text.H6>
      </div>
    )
  }

  return (
    <div className="max-h-[420px] overflow-y-auto px-3 py-2">
      <ul>
        {items.map((n) => (
          <li key={n.id}>
            <NotificationItem notification={n} />
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} className="h-2" />
      {isFetchingNextPage ? (
        <div className="p-2 text-center">
          <Text.H6 color="foregroundMuted">Loading…</Text.H6>
        </div>
      ) : null}
      {!hasNextPage && (
        <div className="p-2 text-center">
          <Text.H6 color="foregroundMuted">No more notifications</Text.H6>
        </div>
      )}
    </div>
  )
}
