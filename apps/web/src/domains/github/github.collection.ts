import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type GithubDeliveryCursor, type GithubDeliveryRecord, listGithubDeliveries } from "./github.functions.ts"

const githubDeliveriesQueryKey = ["github-integration", "deliveries"] as const

/**
 * Keyset-paginated webhook deliveries for the org, newest first. The server returns
 * 25 per page; `infiniteScroll` loads older pages as the `InfiniteTable` reaches the
 * bottom (mirrors `useDestinationSyncRuns`).
 */
export function useGithubDeliveries() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: githubDeliveriesQueryKey,
    queryFn: ({ pageParam }) => listGithubDeliveries({ data: { ...(pageParam ? { before: pageParam } : {}) } }),
    initialPageParam: null as GithubDeliveryCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const deliveries: readonly GithubDeliveryRecord[] = useMemo(
    () => data?.pages.flatMap((page) => page.deliveries) ?? [],
    [data],
  )

  return { deliveries, isLoading, infiniteScroll }
}
