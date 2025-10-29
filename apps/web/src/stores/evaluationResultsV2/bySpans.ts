'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'

export default function useEvaluationResultsV2BySpans(
  {
    project,
    commit,
    document,
    spanId,
    traceId,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    spanId?: string
    traceId?: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid).evaluations.results.spans.root
  const query = useMemo(() => {
    const query = new URLSearchParams()
    if (spanId) query.set('spanId', spanId)
    if (traceId) query.set('traceId', traceId)
    return query.toString()
  }, [spanId, traceId])
  const fetcher = useFetcher<ResultWithEvaluationV2[]>(route, {
    searchParams: query,
  })

  const { data = [], ...rest } = useSWR<ResultWithEvaluationV2[]>(
    spanId && traceId
      ? compact([
          'evaluationResultsV2BySpans',
          project.id,
          commit.uuid,
          document.commitId,
          document.documentUuid,
          query,
        ])
      : undefined,
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
