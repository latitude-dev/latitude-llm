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

export type EvaluationResultsV2BySpansParams = {
  projectId: number
  commitUuid: string
  commitId: number
  documentUuid: string
  spanId: string
  documentLogUuid: string
}

export function getEvaluationResultsV2BySpansKey(
  params?: Partial<EvaluationResultsV2BySpansParams>,
) {
  if (
    !params?.projectId ||
    !params?.commitUuid ||
    !params?.commitId ||
    !params?.documentUuid ||
    !params?.spanId ||
    !params?.documentLogUuid
  ) {
    return { route: undefined, key: undefined }
  }

  const route = ROUTES.api.projects
    .detail(params.projectId)
    .commits.detail(params.commitUuid)
    .documents.detail(params.documentUuid).evaluations.results.spans.root

  const key = compact([
    'evaluationResultsV2BySpans',
    params.projectId,
    params.commitUuid,
    params.commitId,
    params.documentUuid,
    params.spanId,
    params.documentLogUuid,
  ])

  const searchParams = compactObject({
    spanId: params.spanId,
    documentLogUuid: params.documentLogUuid,
  }) as Record<string, string>

  return { route, key, searchParams }
}

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
    document?: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    spanId?: string
    documentLogUuid?: string | null
  },
  opts?: SWRConfiguration,
) {
  const { route, key, searchParams } = getEvaluationResultsV2BySpansKey({
    projectId: project.id,
    commitUuid: commit.uuid,
    commitId: document?.commitId,
    documentUuid: document?.documentUuid,
    spanId,
    documentLogUuid: documentLogUuid ?? undefined,
  })

  const fetcher = useFetcher<ResultWithEvaluationV2[]>(route, {
    searchParams,
  })

  const { data = [], ...rest } = useSWR<ResultWithEvaluationV2[]>(
    key,
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
