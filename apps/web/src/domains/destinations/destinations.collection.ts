import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type DestinationSyncRunRecord, listDestinationSyncRuns } from "./destinations.functions.ts"

type RunCursor = { startedAt: string; id: string }

const destinationSyncRunsQueryKey = (destinationId: string) => ["destination-sync-runs", destinationId] as const

/**
 * Keyset-paginated sync-run history for one destination, newest first. The
 * server returns 25 per page; `infiniteScroll` loads older pages as the
 * `InfiniteTable` reaches the bottom. `enabled` keeps the query idle until the
 * destination's runs panel is opened.
 */
export function useDestinationSyncRuns({
  destinationId,
  enabled = true,
}: {
  readonly destinationId: string
  readonly enabled?: boolean
}) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: destinationSyncRunsQueryKey(destinationId),
    queryFn: ({ pageParam }) =>
      listDestinationSyncRuns({
        data: { destinationId, ...(pageParam ? { before: pageParam } : {}) },
      }),
    initialPageParam: null as RunCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const runs: readonly DestinationSyncRunRecord[] = useMemo(
    () => data?.pages.flatMap((page) => page.runs) ?? [],
    [data],
  )

  return { runs, isLoading, infiniteScroll }
}
