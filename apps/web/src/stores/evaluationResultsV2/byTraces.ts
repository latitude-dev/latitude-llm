'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
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
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    traceIds: string[]
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid).evaluations.results.traces.root

  const query = useMemo(() => {
    const query = new URLSearchParams()
    if (traceIds.length > 0) {
      query.set('traceIds', [...new Set(traceIds)].join(','))
    }
    return query.toString()
  }, [traceIds])

  const fetcher = useFetcher<EvaluationResultV2[]>(`${route}?${query}`)

  const { data = [], ...rest } = useSWR<EvaluationResultV2[]>(
    compact([
      'evaluationResultsV2ByTraces',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      query,
    ]),
    fetcher,
    opts,
  )

  // Group results by trace ID for easy lookup
  const dataByTraceId = useMemo(
    () => groupBy(data, (result) => result.evaluatedTraceId),
    [data],
  )

  return {
    data,
    dataByTraceId,
    ...rest,
  }
}
