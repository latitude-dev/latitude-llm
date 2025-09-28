'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import {
  Commit,
  DocumentVersion,
  Project,
  ResultWithEvaluationV2,
} from '@latitude-data/core/schema/types'

export default function useEvaluationResultsV2ByDocumentLogs(
  {
    project,
    commit,
    document,
    documentLogUuids,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    documentLogUuids: string[]
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid).evaluations.results
    .documentLogs.root
  const query = useMemo(() => {
    const query = new URLSearchParams()
    if (documentLogUuids.length) {
      query.set('documentLogUuids', [...new Set(documentLogUuids)].join(','))
    }
    return query.toString()
  }, [documentLogUuids])
  const fetcher = useFetcher<Record<string, ResultWithEvaluationV2[]>>(
    `${route}?${query}`,
  )

  const { data = {}, ...rest } = useSWR<
    Record<string, ResultWithEvaluationV2[]>
  >(
    compact([
      'evaluationResultsV2ByDocumentLogs',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      query,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
