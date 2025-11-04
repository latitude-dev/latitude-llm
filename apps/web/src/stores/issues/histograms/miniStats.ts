'use client'
import { useCallback, useMemo, useTransition } from 'react'
import useSWR, { SWRConfiguration, useSWRConfig } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher, { executeFetch } from '$/hooks/useFetcher'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { HistogramBatchResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/histograms/route'
import { MiniHistogramResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/histograms/route'

const EMPTY_HISTOGRAM: MiniHistogramResponse = { data: [], totalCount: 0 }

/**
 * Build SWR cache key for issue histogram
 */
export function buildIssueHistogramKey(
  projectId: number,
  commitUuid: string,
  issueId: number,
) {
  return ['issueHistogram', projectId, commitUuid, issueId] as const
}

/**
 * Individual histogram store hook for a single issue
 * Uses stable cache key that doesn't change with filters
 */
export function useIssueHistogram(
  {
    projectId,
    commitUuid,
    issueId,
  }: {
    projectId: number
    commitUuid: string
    issueId: number
  },
  swrConfig?: SWRConfiguration<MiniHistogramResponse, any>,
) {
  const route = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid)
    .issues.detail(issueId).histograms

  const key = useMemo(
    () => buildIssueHistogramKey(projectId, commitUuid, issueId),
    [projectId, commitUuid, issueId],
  )

  const fetcher = useFetcher<MiniHistogramResponse>(route)

  const { data = EMPTY_HISTOGRAM, isLoading } = useSWR<MiniHistogramResponse>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false, // Don't auto-fetch if stale
      revalidateOnMount: false, // Don't fetch on mount - wait for batch
      ...swrConfig,
    },
  )

  return useMemo(
    () => ({
      data: data.data,
      totalCount: data.totalCount,
      isLoading,
    }),
    [data, isLoading],
  )
}

/**
 * Batch histogram utility hook
 *
 * This is not a store itself, but a utility to fetch histograms for multiple issues in batch
 * and populate the SWR cache for individual issue histogram hooks.
 */
export function useFetchMiniHistgramsInBatch() {
  const { mutate } = useSWRConfig()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [loadingMiniStats, startTransition] = useTransition()

  const fetchMiniStatsInBatch = useCallback(
    ({ issueIds }: { issueIds: number[] }) => {
      if (issueIds.length === 0) {
        return
      }

      const route = ROUTES.api.projects
        .detail(project.id)
        .commits.detail(commit.uuid).issues.histograms
      startTransition(async () => {
        const response = await executeFetch<HistogramBatchResponse>({
          route,
          searchParams: { issueIds: issueIds.join(',') },
        })

        // Should ever be defined, but typescript is hard
        if (!response) return

        await Promise.all(
          response.issues.map(async (issue) => {
            return mutate(
              buildIssueHistogramKey(project.id, commit.uuid, issue.issueId),
              { data: issue.data, totalCount: issue.totalCount }, // Store full object, not just data
              false,
            )
          }),
        )
      })
    },
    [project.id, commit.uuid, mutate, startTransition],
  )

  return useMemo(
    () => ({
      loadingMiniStats,
      fetchMiniStatsInBatch,
    }),
    [loadingMiniStats, fetchMiniStatsInBatch],
  )
}
