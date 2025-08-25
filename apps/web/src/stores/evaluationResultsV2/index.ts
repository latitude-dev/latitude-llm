'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  type Commit,
  type DocumentVersion,
  type EvaluationMetric,
  type EvaluationResultsV2Search,
  evaluationResultsV2SearchToQueryParams,
  type EvaluationResultV2WithDetails,
  type EvaluationType,
  type EvaluationV2,
  type Project,
} from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { type SWRConfiguration } from 'swr'

export function useEvaluationResultsV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  {
    project,
    commit,
    document,
    evaluation,
    search,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    evaluation: Pick<EvaluationV2<T, M>, 'uuid'>
    search?: EvaluationResultsV2Search
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid)
    .evaluations.detail(evaluation.uuid).results.root
  const query = useMemo(
    () => (search ? evaluationResultsV2SearchToQueryParams(search) : ''),
    [search],
  )
  const fetcher = useFetcher<EvaluationResultV2WithDetails<T, M>[]>(`${route}?${query}`)

  const { data = [], ...rest } = useSWR<EvaluationResultV2WithDetails<T, M>[]>(
    compact([
      'evaluationResultsV2',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      evaluation.uuid,
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

export function useEvaluationResultsV2Count<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  {
    project,
    commit,
    document,
    evaluation,
    search,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    evaluation: Pick<EvaluationV2<T, M>, 'uuid'>
    search?: EvaluationResultsV2Search
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid)
    .evaluations.detail(evaluation.uuid).results.count.root
  const query = useMemo(
    () =>
      search
        ? evaluationResultsV2SearchToQueryParams({
            ...search,
            // Note: no need to react to pagination changes
            pagination: { page: 0, pageSize: 0 },
          })
        : '',
    [search],
  )
  const fetcher = useFetcher<number>(`${route}?${query}`)

  const { data = 0, ...rest } = useSWR<number>(
    compact([
      'evaluationResultsV2Count',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      evaluation.uuid,
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
