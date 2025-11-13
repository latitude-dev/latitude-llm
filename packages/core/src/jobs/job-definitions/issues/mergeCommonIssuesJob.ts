/*
- This job is debounced (leading), only runs (with mutual exclusion) max 1
every day (THIS IS ALREADY DONE WHEN ENQUEUING THE JOB in add/remove result
from issue services) - Find the existing issue by id in the database. This job
executing means that this issue is ongoing currently and could be deviating
towards another existing issue/s. - Call mergeIssues service

if UnprocessableEntityError fail silently
*/

import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { isFeatureEnabledByName } from '../../../services/workspaceFeatures/isFeatureEnabledByName'
import { IssuesRepository } from '../../../repositories'
import { mergeIssue } from '../../../services/issues/merge'

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
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { issueId, workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const enabled = await isFeatureEnabledByName(workspace.id, 'issues').then((r) => r.unwrap()) // prettier-ignore
  if (!enabled) return

  const issue = await new IssuesRepository(workspace.id)
    .find(issueId)
    .then((r) => r.unwrap())

  await mergeIssue({ issue })
}
