import { assignIssueAction } from '$/actions/evaluationsV2/results/issues/assignIssue'
import { createIssueAction } from '$/actions/evaluationsV2/results/issues/createIssue'
import { generateIssueAction } from '$/actions/evaluationsV2/results/issues/generateIssue'
import { unAssignIssueAction } from '$/actions/evaluationsV2/results/issues/unAssignIssue'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { EvaluationResultV2 } from '@latitude-data/constants'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useIssue(
  {
    projectId,
    commitUuid,
    issueId,
    onIssueAssigned,
    onIssueUnAssigned,
    onIssueGenerated,
  }: {
    projectId: number
    commitUuid: string
    issueId?: number | null
    onIssueAssigned?: (_args: {
      data: {
        issue: Issue
        evaluationResult: EvaluationResultV2
      }
    }) => void
    onIssueUnAssigned?: (_args: { data: EvaluationResultV2 }) => void
    onIssueGenerated?: (_args: {
      data: {
        title: string
        description: string
      }
    }) => void
    onCreateIssueError?: (_args: { message: string }) => void
  },
  swrConfig?: SWRConfiguration<Issue, any>,
) {
  const base = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
  const route = issueId ? base.issues.detail(issueId).root : undefined
  const fetcher = useFetcher<Issue>(route ? route : undefined, {
    fallback: null,
  })
  const { data, isLoading } = useSWR<Issue>(
    ['issueByProject', projectId, commitUuid, issueId],
    fetcher,
    swrConfig,
  )

  const { execute: assignIssue, isPending: isAssigningIssue } =
    useLatitudeAction(assignIssueAction, { onSuccess: onIssueAssigned })

  const { execute: unAssignIssue, isPending: isUnAssigningIssue } =
    useLatitudeAction(unAssignIssueAction, { onSuccess: onIssueUnAssigned })

  const { execute: createIssue, isPending: isCreatingIssue } =
    useLatitudeAction(createIssueAction, {
      onSuccess: onIssueAssigned,
    })

  const { execute: generateIssue, isPending: isGeneratingIssue } =
    useLatitudeAction(generateIssueAction, { onSuccess: onIssueGenerated })

  return useMemo(
    () => ({
      data,
      isLoading,
      assignIssue,
      isAssigningIssue,
      unAssignIssue,
      isUnAssigningIssue,
      createIssue,
      isCreatingIssue,
      generateIssue,
      isGeneratingIssue,
    }),
    [
      data,
      isLoading,
      assignIssue,
      isAssigningIssue,
      unAssignIssue,
      isUnAssigningIssue,
      createIssue,
      isCreatingIssue,
      generateIssue,
      isGeneratingIssue,
    ],
  )
}
