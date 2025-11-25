'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { IssueEvaluationStats } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/enoughAnnotations/route'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'

export function useEnoughAnnotationsForIssue(
  {
    project,
    commit,
    issueId,
    documentUuid,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    issueId: number
    documentUuid: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .issues.detail(issueId).enoughAnnotations.root

  const fetcher = useFetcher<IssueEvaluationStats>(route, {
    searchParams: { documentUuid },
  })

  const { data = undefined, ...rest } = useSWR<IssueEvaluationStats>(
    compact([
      'enoughAnnotationsForIssue',
      project.id,
      commit.uuid,
      issueId,
      documentUuid,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
