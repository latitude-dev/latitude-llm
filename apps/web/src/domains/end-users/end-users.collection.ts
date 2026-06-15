import type { UserSortField } from "@domain/spans"
import type { InfiniteTableInfiniteScroll } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type {
  ProjectUserRecord,
  ProjectUsersPageRecord,
  UserActivityRecord,
  UserBehaviourRecord,
  UserIssueRecord,
  UserProfileRecord,
  UsersOverviewRecord,
  UserUsageSliceRecord,
} from "./end-users.functions.ts"
import {
  getUserActivity,
  getUserProfile,
  getUsersOverview,
  getUserUsage,
  listProjectUsers,
  listUserBehaviours,
  listUserIssues,
} from "./end-users.functions.ts"

const DEFAULT_USERS_BATCH_SIZE = 50
const USERS_QUERY_STALE_TIME_MS = 30_000

interface UsersSorting {
  readonly column: UserSortField
  readonly direction: "asc" | "desc"
}

interface UsersTimeRange {
  readonly fromIso?: string
  readonly toIso?: string
}

interface UsersKeyInput {
  readonly projectId: string
  readonly limit: number
  readonly sorting: UsersSorting
  readonly searchQuery: string | undefined
  readonly timeRange: UsersTimeRange | undefined
  readonly trendBucketSeconds: number | undefined
}

const getUsersQueryKey = (input: UsersKeyInput) =>
  [
    "end-users",
    input.projectId,
    input.limit,
    input.sorting.column,
    input.sorting.direction,
    input.searchQuery ?? null,
    input.timeRange?.fromIso ?? null,
    input.timeRange?.toIso ?? null,
    input.trendBucketSeconds ?? null,
  ] as const

const buildListUsersRequest = (input: UsersKeyInput, offset: number) => ({
  projectId: input.projectId,
  limit: input.limit,
  offset,
  sort: {
    field: input.sorting.column,
    direction: input.sorting.direction,
  },
  ...(input.searchQuery ? { searchQuery: input.searchQuery } : {}),
  ...(input.timeRange?.fromIso || input.timeRange?.toIso ? { timeRange: input.timeRange } : {}),
  ...(input.trendBucketSeconds !== undefined ? { trendBucketSeconds: input.trendBucketSeconds } : {}),
})

export function useProjectUsers(input: {
  readonly projectId: string
  readonly sorting?: UsersSorting
  readonly searchQuery?: string
  readonly timeRange?: UsersTimeRange
  readonly trendBucketSeconds?: number
  readonly limit?: number
  readonly enabled?: boolean
}) {
  const normalizedSearchQuery = input.searchQuery?.trim() || undefined
  const sorting = input.sorting ?? { column: "lastSeen", direction: "desc" }
  const limit = input.limit ?? DEFAULT_USERS_BATCH_SIZE
  const keyInput: UsersKeyInput = {
    projectId: input.projectId,
    limit,
    sorting,
    searchQuery: normalizedSearchQuery,
    timeRange: input.timeRange,
    trendBucketSeconds: input.trendBucketSeconds,
  }

  const queryKey = getUsersQueryKey(keyInput)

  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }): Promise<ProjectUsersPageRecord> =>
      listProjectUsers({ data: buildListUsersRequest(keyInput, pageParam) }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: (input.enabled ?? true) && input.projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage ?? false,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: fetchNextPage,
    }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const data = useMemo(() => paginatedData?.pages.flatMap((page) => page.items) ?? [], [paginatedData])

  return {
    data: data as readonly ProjectUserRecord[],
    totalCount: paginatedData?.pages[0]?.totalCount ?? 0,
    activityBucketSeconds: paginatedData?.pages[0]?.activityBucketSeconds,
    costRollup: paginatedData?.pages[0]?.costRollup,
    isLoading,
    infiniteScroll,
  }
}

export function useUsersOverview({
  projectId,
  timeRange,
  enabled = true,
}: {
  readonly projectId: string
  readonly timeRange?: UsersTimeRange
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["end-users-overview", projectId, timeRange?.fromIso ?? null, timeRange?.toIso ?? null],
    queryFn: (): Promise<UsersOverviewRecord> =>
      getUsersOverview({
        data: {
          projectId,
          ...(timeRange?.fromIso || timeRange?.toIso ? { timeRange } : {}),
        },
      }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}

export function useUserProfile({
  projectId,
  userId,
  errorsOnly = false,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["end-user-profile", projectId, userId, errorsOnly],
    queryFn: (): Promise<UserProfileRecord | null> =>
      getUserProfile({ data: { projectId, userId, ...(errorsOnly ? { errorsOnly: true } : {}) } }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}

export function useUserActivity({
  projectId,
  userId,
  timeRange,
  errorsOnly = false,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly timeRange?: UsersTimeRange
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: [
      "end-user-activity",
      projectId,
      userId,
      timeRange?.fromIso ?? null,
      timeRange?.toIso ?? null,
      errorsOnly,
    ],
    queryFn: (): Promise<UserActivityRecord> =>
      getUserActivity({
        data: {
          projectId,
          userId,
          ...(timeRange?.fromIso || timeRange?.toIso ? { timeRange } : {}),
          ...(errorsOnly ? { errorsOnly: true } : {}),
        },
      }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}

export function useUserUsage({
  projectId,
  userId,
  dimension,
  errorsOnly = false,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly dimension: "model" | "provider" | "tool"
  readonly errorsOnly?: boolean
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["end-user-usage", projectId, userId, dimension, errorsOnly],
    queryFn: (): Promise<readonly UserUsageSliceRecord[]> =>
      getUserUsage({ data: { projectId, userId, dimension, ...(errorsOnly ? { errorsOnly: true } : {}) } }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}

export function useUserIssues({
  projectId,
  userId,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["end-user-issues", projectId, userId],
    queryFn: (): Promise<readonly UserIssueRecord[]> => listUserIssues({ data: { projectId, userId } }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}

export function useUserBehaviours({
  projectId,
  userId,
  enabled = true,
}: {
  readonly projectId: string
  readonly userId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["end-user-behaviours", projectId, userId],
    queryFn: (): Promise<readonly UserBehaviourRecord[]> => listUserBehaviours({ data: { projectId, userId } }),
    staleTime: USERS_QUERY_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0 && userId.length > 0,
  })
}
