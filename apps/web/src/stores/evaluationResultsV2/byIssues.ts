'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'

import { EvaluationResultV2 } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { compactObject } from '@latitude-data/core/lib/compactObject'

export function useEvaluationResultsV2ByIssues(
  {
    project,
    commit,
    document,
    issueIds,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'documentUuid'>
    issueIds: number[]
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid).evaluations.results.issues.root

  const fetcher = useFetcher<EvaluationResultV2[]>(route, {
    searchParams: compactObject({
      issueIds: issueIds.join(','),
    }) as Record<string, string>,
  })

  const { data = [], ...rest } = useSWR<EvaluationResultV2[]>(
    compact([
      'evaluationResultsV2ByIssues',
      project.id,
      commit.uuid,
      document.documentUuid,
      issueIds,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
