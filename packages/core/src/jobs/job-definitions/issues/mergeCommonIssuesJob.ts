import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import { findIssue } from '../../../queries/issues/findById'
import { mergeIssues } from '../../../services/issues/merge'
import { isIssueActive } from '../../../services/issues/shared'

export type MergeCommonIssuesJobData = {
  workspaceId: number
  issueId: number
}

export function mergeCommonIssuesJobKey({
  workspaceId,
  issueId,
}: MergeCommonIssuesJobData) {
  return `mergeCommonIssuesJob-${workspaceId}-${issueId}`
}

export const mergeCommonIssuesJob = async (
  job: Job<MergeCommonIssuesJobData>,
) => {
  const { workspaceId, issueId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const issue = await findIssue({ workspaceId: workspace.id, id: issueId })

  if (!isIssueActive(issue)) return

  const merging = await mergeIssues({ workspace, issue })
  if (merging.error) {
    if (merging.error instanceof UnprocessableEntityError) return
    throw merging.error
  }
}
