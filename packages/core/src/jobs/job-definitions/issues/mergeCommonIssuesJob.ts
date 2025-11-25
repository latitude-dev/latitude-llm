import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import { IssuesRepository } from '../../../repositories'
import { mergeIssues } from '../../../services/issues/merge'
import { isIssueActive } from '../../../services/issues/shared'
import { isFeatureEnabledByName } from '../../../services/workspaceFeatures/isFeatureEnabledByName'

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
  console.log('MERGING ISSUES')
  const { workspaceId, issueId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const enabled = await isFeatureEnabledByName(workspace.id, 'issues').then((r) => r.unwrap()) // prettier-ignore
  if (!enabled) return

  const issuesRepository = new IssuesRepository(workspace.id)
  const issue = await issuesRepository.find(issueId).then((r) => r.unwrap())

  if (!isIssueActive(issue)) return

  const merging = await mergeIssues({ workspace, issue })
  if (merging.error) {
    if (merging.error instanceof UnprocessableEntityError) return
    throw merging.error
  }
}
