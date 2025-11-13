'use client'

import { useMemo } from 'react'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ProviderLogDto } from '@latitude-data/core/schema/types'

export type IssueLog = {
  uuid: string
  createdAt: Date
  duration: number | null
  commit: {
    uuid: string
    version: number | null
    title: string
  }
  providerLog: ProviderLogDto
}

export type IssueLogsResponse = {
  logs: IssueLog[]
  hasNextPage: boolean
}

const EMPTY_LOGS: IssueLog[] = []

export function useIssueLogs(
  {
    projectId,
    commitUuid,
    issueId,
    page = 1,
    pageSize = 25,
  }: {
    projectId: number
    commitUuid: string
    issueId: number
    page?: number
    pageSize?: number
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid)
    .issues.detail(issueId).logs!.root

  const fetcher = useFetcher<IssueLogsResponse>(route, {
    searchParams: { page: page.toString(), pageSize: pageSize.toString() },
  })

  const { data, isLoading } = useSWR<IssueLogsResponse>(
    compact(['issueLogs', projectId, commitUuid, issueId, page, pageSize]),
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data: data?.logs ?? EMPTY_LOGS,
      hasNextPage: data?.hasNextPage ?? false,
      isLoading,
    }),
    [data, isLoading],
  )
}
