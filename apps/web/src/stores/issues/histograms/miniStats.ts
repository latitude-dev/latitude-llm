'use client'
import { useCallback, useMemo, useTransition } from 'react'
import useSWR, { State, useSWRConfig } from 'swr'
import { ROUTES } from '$/services/routes'
import { executeFetch } from '$/hooks/useFetcher'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { HistogramBatchResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/histograms/route'
import { MiniHistogramResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/histograms/route'

type LocalMiniHistogramResponse = MiniHistogramResponse & {
  fetchedAt: number
}

const EMPTY_HISTOGRAM: MiniHistogramResponse = { data: [], totalCount: 0 }
const STALE_MS = 30_000

/**
 * Build SWR cache key for issue histogram
 */
export function buildIssueHistogramKey(
  projectId: number,
  commitUuid: string,
  issueId: number,
) {
  return ['issueHistogram', projectId, commitUuid, issueId].join('-')
}

/**
 * Individual histogram store hook for a single issue
 * Uses stable cache key that doesn't change with filters
 * Does not auto-fetch - data is populated via batch fetching or manual trigger
 */
export function useIssueHistogram({
  projectId,
  commitUuid,
  issueId,
}: {
  projectId: number
  commitUuid: string
  issueId: number
}) {
  const key = useMemo(
    () => buildIssueHistogramKey(projectId, commitUuid, issueId),
    [projectId, commitUuid, issueId],
  )

  // Read from cache only - never auto-fetches
  const { data = EMPTY_HISTOGRAM } = useSWR<MiniHistogramResponse>(key, null, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnMount: false,
  })

  return useMemo(
    () => ({
      data: data.data,
      totalCount: data.totalCount,
    }),
    [data],
  )
}

function isStale(entry: State<LocalMiniHistogramResponse, any> | undefined) {
  if (!entry) return true

  if (!entry.data?.fetchedAt) return true

  return Date.now() - entry.data.fetchedAt > STALE_MS
}

/**
 * Batch histogram utility hook
 *
 * This is not a store itself, but a utility to fetch histograms for multiple issues in batch
 * and populate the SWR cache for individual issue histogram hooks.
 */
export function useFetchMiniHistgramsInBatch() {
  const { cache, mutate } = useSWRConfig()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [loadingMiniStats, startTransition] = useTransition()

  const fetchMiniStatsInBatch = useCallback(
    async ({ issueIds }: { issueIds: number[] }) => {
      if (issueIds.length === 0) {
        return
      }

      const route = ROUTES.api.projects
        .detail(project.id)
        .commits.detail(commit.uuid).issues.histograms

      const toFetch = issueIds.filter((id) => {
        const histogramKey = buildIssueHistogramKey(project.id, commit.uuid, id)
        const existing = cache.get(histogramKey)
        return isStale(existing)
      })

      if (toFetch.length === 0) return

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
              {
                data: issue.data,
                totalCount: issue.totalCount,
                fetchedAt: Date.now(),
              },
              false,
            )
          }),
        )
      })
    },
    [project.id, commit.uuid, mutate, startTransition, cache],
  )

  return useMemo(
    () => ({
      loadingMiniStats,
      fetchMiniStatsInBatch,
    }),
    [loadingMiniStats, fetchMiniStatsInBatch],
  )
}
