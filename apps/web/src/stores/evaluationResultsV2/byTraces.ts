'use client'

import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
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
  const uniqueTraceIds = useMemo(
    () => [...new Set(traceIds)].sort().join(','),
    [traceIds],
  )
  const searchParams = useMemo(
    () =>
      compactObject({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document?.documentUuid,
        traceIds: uniqueTraceIds || undefined,
      }) as Record<string, string>,
    [project.id, commit.uuid, document?.documentUuid, uniqueTraceIds],
  )

  const fetcher = useFetcher<EvaluationResultV2[]>(route, { searchParams })
  const {
    data = [],
    mutate,
    error,
    isLoading,
    isValidating,
  } = useSWR<EvaluationResultV2[]>(
    disabled
      ? null
      : compact([
          'evaluationResultsV2ByTraces',
          project.id,
          commit.uuid,
          document?.documentUuid,
          uniqueTraceIds,
        ]),
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
