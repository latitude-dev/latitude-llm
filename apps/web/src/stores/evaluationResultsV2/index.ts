'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  Commit,
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
  Project,
} from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsV2(
  {
    project,
    commit,
    document,
    evaluation,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    evaluation: Pick<EvaluationV2, 'uuid'>
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid)
      .evaluationsV2.detail(evaluation.uuid).results.root,
  )

  const { data = [], ...rest } = useSWR<EvaluationResultV2[]>(
    compact([
      'evaluationResultsV2',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      evaluation.uuid,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
