import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { executeFetch } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { App } from '@pipedream/sdk/browser'
import { useCallback, useMemo } from 'react'
import useSWRInfinite, { SWRInfiniteConfiguration } from 'swr/infinite'

type PipedreamApp = App & {
  triggerCount?: number
}
type PipedreamAppsResponse = {
  apps: PipedreamApp[]
  totalCount: number
  cursor: string
}

// TODO: Move to `hooks/useFetcher.ts` if reusable
function useInfiniteFetcher<T>(
  route: string,
  paramExtractor: (key: string[]) => Record<string, string>,
) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()

  return useCallback(
    async (key: string[]) => {
      const searchParams = paramExtractor(key)

      const result = await executeFetch<T>({
        route,
        searchParams,
        toast,
        navigate,
        currentUrl,
      })

      return result as T
    },
    [route, paramExtractor, toast, navigate, currentUrl],
  )
}

export default function usePipedreamApps(
  {
    query,
    withTriggers,
    withTools,
  }: {
    query?: string
    withTriggers?: boolean
    withTools?: boolean
  } = {},
  opts?: SWRInfiniteConfiguration<PipedreamAppsResponse, any>,
) {
  const getKey = useCallback(
    (pageIndex: number, previousPageData: PipedreamAppsResponse | null) => {
      if (pageIndex === 0) {
        return [
          'pipedream-apps',
          withTriggers,
          withTools,
          query || '',
          '',
        ] as const
      }

      // If previous page data is empty or doesn't have a cursor, we've reached the end
      if (!previousPageData || !previousPageData.cursor) {
        return null
      }

      return [
        'pipedream-apps',
        withTriggers,
        withTools,
        query || '',
        previousPageData.cursor,
      ] as const
    },
    [withTriggers, withTools, query],
  )

  // Use the reusable infinite fetcher hook
  const fetcher = useInfiniteFetcher<PipedreamAppsResponse>(
    ROUTES.api.integrations.pipedream.apps,
    useCallback((key: string[]) => {
      const searchParams: Record<string, string> = {}

      // Extract params from key: [cacheName, withTriggers, withTools, query, cursor]
      if (key[1]) searchParams.withTriggers = key[1]
      if (key[2]) searchParams.withTools = key[2]
      if (key[3]) searchParams.query = key[3]
      if (key[4]) searchParams.cursor = key[4]

      return searchParams
    }, []),
  )

  const {
    data,
    error,
    mutate,
    size,
    setSize,
    isValidating,
    isLoading,
    ...rest
  } = useSWRInfinite<PipedreamAppsResponse>(getKey, fetcher, opts)

  const flattenedData = useMemo(() => {
    if (!data) return []
    return data.flatMap((page) => page.apps)
  }, [data])

  // Check if we're loading more pages
  const isLoadingMore = useMemo(() => {
    if (!data || data.length === 0) return false
    // We're loading more if we're validating and we have more than 1 page requested
    return isValidating && size > 1
  }, [data, size, isValidating])

  // Check if we've reached the end (no more pages to load)
  const isReachingEnd = useMemo(() => {
    if (!data) return false
    const lastPage = data[data.length - 1]
    return !lastPage?.cursor || lastPage?.apps?.length === 0
  }, [data])

  // Get total count from the first page (assuming the API returns it)
  const totalCount = useMemo(() => {
    return data?.[0]?.totalCount ?? 0
  }, [data])

  // Function to load more pages
  const loadMore = useCallback(() => {
    if (!isReachingEnd && !isValidating) {
      setSize(size + 1)
    }
  }, [isReachingEnd, isValidating, setSize, size])

  return useMemo(
    () => ({
      data: flattenedData,
      error,
      mutate,
      size,
      setSize,
      loadMore,
      isValidating,
      isLoading,
      isLoadingMore,
      isReachingEnd,
      totalCount,
      ...rest,
    }),
    [
      flattenedData,
      error,
      mutate,
      size,
      setSize,
      loadMore,
      isValidating,
      isLoading,
      isLoadingMore,
      isReachingEnd,
      totalCount,
      rest,
    ],
  )
}
