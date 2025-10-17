import { LatitudeError } from '@latitude-data/constants/errors'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type Project } from '../../../schema/models/types/Project'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { queues } from '../../../jobs/queues'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { checkLatteCredits } from './credits/check'
import { assertCopilotIsSupported } from './helpers'

export async function createLatteJob({
  workspace,
  project,
  threadUuid,
  message,
  context,
  user,
  debugVersionUuid,
}: {
  workspace: Workspace
  project: Project
  threadUuid: string
  message: string
  context: string
  user: User
  debugVersionUuid?: string
}): PromisedResult<string> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  const checking = await checkLatteCredits({ workspace })
  if (checking.error) {
    return Result.error(checking.error)
  }

  const { latteQueue } = await queues()
  const job = await latteQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    projectId: project.id,
    threadUuid,
    message,
    context,
    userId: user.id,
    debugVersionUuid,
  } as RunLatteJobData)

  if (!job.id) {
    return Result.error(
      new LatitudeError('Latte job creation failed due to missing job ID'),
    )
  }

  return Result.ok(job.id)
}
