import { useEffect, useMemo, useRef } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import { IssuesServerResponse } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/page'
import {
  DEFAULTS_ISSUE_PARAMS,
  IssuesFiltersQueryParamsInput,
} from '@latitude-data/constants/issues'
import useFetcher from '$/hooks/useFetcher'
import { buildIssuesCacheKey } from '@latitude-data/constants/issues'

const EMPTY_ISSUES_RESPONSE = {
  issues: [],
  page: 1,
  limit: DEFAULTS_ISSUE_PARAMS.limit,
  totalCount: 0,
} satisfies IssuesServerResponse

type Issue = IssuesServerResponse['issues'][number]
export type SerializedIssue = Omit<Issue, 'lastSeenDate' | 'createdAt'> & {
  lastSeenDate: Date
  createdAt: Date
}

type IssuesResponseSerialized = Omit<IssuesServerResponse, 'issues'> & {
  issues: SerializedIssue[]
}

function serializer(response: IssuesServerResponse): IssuesResponseSerialized {
  if (!response) return EMPTY_ISSUES_RESPONSE

  return {
    ...response,
    issues: response.issues.map((issue) => ({
      ...issue,
      lastSeenDate: new Date(issue.lastSeenDate),
      createdAt: new Date(issue.createdAt),
    })),
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

  return useMemo(
    () => ({
      data: data.issues ?? [],
      isLoading,
    }),
    [data, isLoading],
  )
}
