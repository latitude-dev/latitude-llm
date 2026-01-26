'use client'

import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compact, groupBy } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { EvaluationResultV2 } from '@latitude-data/constants'

export default function useEvaluationResultsV2ByTraces(
  {
    project,
    commit,
    document,
    traceIds,
    disabled = false,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document?: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    traceIds: string[]
    disabled?: boolean
  },
  opts?: SWRConfiguration,
) {
  const route = API_ROUTES.evaluations.results.traces.root
  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('projectId', project.id.toString())
    params.set('commitUuid', commit.uuid)
    if (document?.documentUuid)
      params.set('documentUuid', document.documentUuid)
    if (traceIds.length > 0)
      params.set('traceIds', [...new Set(traceIds)].join(','))

    return params.toString()
  }, [traceIds, project.id, commit.uuid, document?.documentUuid])

  const fetcher = useFetcher<EvaluationResultV2[]>(`${route}?${query}`)
  const {
    data = [],
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<EvaluationResultV2[]>(
    disabled
      ? null
      : compact(['evaluationResultsV2ByTraces', ...traceIds, query]),
    fetcher,
    opts,
  )

  // Group results by trace ID for easy lookup
  const dataByTraceId = useMemo(
    () => groupBy(data, (result) => result.evaluatedTraceId),
    [data],
  )

  return useMemo(
    () => ({
      data,
      dataByTraceId,
      mutate,
      error,
      isLoading,
      isValidating,
    }),
    [data, dataByTraceId, mutate, error, isLoading, isValidating],
  )
}
