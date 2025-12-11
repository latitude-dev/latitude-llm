'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { compactObject } from '@latitude-data/core/lib/compactObject'

export default function useEvaluationResultsV2BySpans(
  {
    project,
    commit,
    document,
    spanId,
    documentLogUuid,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    spanId?: string
    documentLogUuid?: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid).evaluations.results.spans.root
  const fetcher = useFetcher<ResultWithEvaluationV2[]>(route, {
    searchParams: compactObject({
      spanId: spanId ?? undefined,
      documentLogUuid: documentLogUuid ?? undefined,
    }) as Record<string, string>,
  })

  const { data = [], ...rest } = useSWR<ResultWithEvaluationV2[]>(
    spanId && documentLogUuid
      ? compact([
          'evaluationResultsV2BySpans',
          project.id,
          commit.uuid,
          document.commitId,
          document.documentUuid,
          spanId,
          documentLogUuid,
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
