import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { EvaluationResultV2 } from '@latitude-data/constants'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { assignIssueAction } from '$/actions/evaluationsV2/issues/assignIssue'
import { unAssignIssueAction } from '$/actions/evaluationsV2/issues/unAssignIssue'
import { createIssueAction } from '$/actions/evaluationsV2/issues/createIssue'

export function useIssue(
  {
    projectId,
    commitUuid,
    issueId,
    onIssueAssigned,
    onIssueUnAssigned,
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

  const { execute: createIssue, isPending: isCreating } = useLatitudeAction(
    createIssueAction,
    { onSuccess: onIssueAssigned },
  )
  return useMemo(
    () => ({
      data,
      isLoading,
      assignIssue,
      isAssigningIssue,
      unAssignIssue,
      isUnAssigningIssue,
      createIssue,
      isCreating,
    }),
    [
      data,
      isLoading,
      assignIssue,
      isAssigningIssue,
      unAssignIssue,
      isUnAssigningIssue,
      createIssue,
      isCreating,
    ],
  )
}
