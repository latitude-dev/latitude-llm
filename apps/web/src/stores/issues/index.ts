import { useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR, { SWRConfiguration, useSWRConfig } from 'swr'
import { ROUTES } from '$/services/routes'
import { IssuesServerResponse } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/page'
import {
  convertIssuesParamsToQueryParams,
  DEFAULTS_ISSUE_PARAMS,
  IssuesFiltersQueryParamsInput,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import useFetcher from '$/hooks/useFetcher'
import { buildIssuesCacheKey } from '@latitude-data/constants/issues'

const EMPTY_ISSUES_RESPONSE = {
  issues: [],
  page: 1,
  limit: DEFAULTS_ISSUE_PARAMS.limit,
  totalCount: 0,
} satisfies IssuesServerResponse

export type Issue = IssuesServerResponse['issues'][number]
export type SerializedIssue = Omit<
  Issue,
  | 'createdAt'
  | 'firstSeenDate'
  | 'lastSeenDate'
  | 'firstOccurredAt'
  | 'lastOccurredAt'
> & {
  firstOccurredAt: Date
  lastOccurredAt: Date
  firstSeenDate: Date
  lastSeenDate: Date
  createdAt: Date
}

type IssuesResponseSerialized = Omit<IssuesServerResponse, 'issues'> & {
  issues: SerializedIssue[]
}

export function serializer(
  response: IssuesServerResponse,
): IssuesResponseSerialized {
  if (!response) return EMPTY_ISSUES_RESPONSE

  return {
    ...response,
    issues: response.issues.map(serializeIssue),
  }
}

export function serializeIssue(issue: Issue): SerializedIssue {
  return {
    ...issue,
    firstSeenDate: new Date(issue.firstSeenDate),
    firstOccurredAt: new Date(issue.firstOccurredAt),
    lastSeenDate: new Date(issue.lastSeenDate),
    lastOccurredAt: new Date(issue.lastOccurredAt),
    createdAt: new Date(issue.createdAt),
  }
}

export function useIssues(
  {
    projectId,
    commitUuid,
    initialPage,
    searchParams,
    onSuccess,
  }: {
    projectId: number
    commitUuid: string
    initialPage: number
    searchParams: Partial<IssuesFiltersQueryParamsInput>
    onSuccess: (data: IssuesServerResponse | void) => void
  },
  swrConfig?: SWRConfiguration<IssuesServerResponse, any>,
) {
  const isSSR = useRef(!!swrConfig?.fallbackData)
  const { mutate: globalMutate } = useSWRConfig()
  const route = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
    .issues.root

  const key = useMemo(
    () =>
      buildIssuesCacheKey({
        projectId,
        commitUuid,
        searchParams,
      }),
    [projectId, commitUuid, searchParams],
  )
  const fetcher = useFetcher<IssuesResponseSerialized, IssuesServerResponse>(
    route,
    {
      searchParams,
      onSuccess,
      serializer,
    },
  )

  const currentPage = Number(searchParams.page ?? initialPage)
  const swrOptions = useMemo(() => {
    return currentPage === initialPage
      ? {
          fallbackData: swrConfig?.fallbackData
            ? serializer(swrConfig.fallbackData)
            : undefined,
        }
      : {}
  }, [swrConfig, currentPage, initialPage])

  const hasFallbackData =
    currentPage === initialPage && swrConfig?.fallbackData !== undefined

  const { data = EMPTY_ISSUES_RESPONSE, isLoading } =
    useSWR<IssuesResponseSerialized>(key, fetcher, {
      ...swrOptions,
      keepPreviousData: true,
      revalidateOnMount: !hasFallbackData, // Only revalidate on mount if we don't have server data
      revalidateOnFocus: false,
      // NOTE: We don't have caching because filters/sorting can change often
      // Set this to false and do a manual revalidation when needed
      revalidateIfStale: true,
      revalidateOnReconnect: !isSSR.current,
    })

  useEffect(() => {
    // This should never run more than once, only on mount
    isSSR.current = false
  }, [])

  // When server render page we init cache with server data to avoid refetching
  const initServerData = useCallback(
    ({
      projectId,
      commitUuid,
      serverParams,
      serverResponse,
    }: {
      projectId: number
      commitUuid: string
      serverParams: SafeIssuesParams
      serverResponse: IssuesServerResponse
    }) => {
      const issuesCacheKey = buildIssuesCacheKey({
        projectId,
        commitUuid,
        searchParams: convertIssuesParamsToQueryParams(serverParams),
      })
      return globalMutate(issuesCacheKey, serializer(serverResponse), {
        revalidate: false,
      })
    },
    [globalMutate],
  )

  return useMemo(
    () => ({
      data: data.issues ?? [],
      initServerData,
      isLoading,
    }),
    [data, isLoading, initServerData],
  )
}
