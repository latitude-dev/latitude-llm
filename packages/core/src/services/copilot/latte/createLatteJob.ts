import { LatitudeError } from '@latitude-data/constants/errors'
import { User, Workspace } from '../../../browser'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { documentsQueue } from '../../../jobs/queues'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { checkLatteCredits } from './credits/check'
import { assertCopilotIsSupported } from './helpers'

export async function createLatteJob({
  workspace,
  threadUuid,
  message,
  context,
  user,
  debugVersionUuid,
}: {
  workspace: Workspace
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

  const job = await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
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
