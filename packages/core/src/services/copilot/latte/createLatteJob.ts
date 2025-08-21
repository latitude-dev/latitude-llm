import { LatitudeError } from '@latitude-data/constants/errors'
import { User, Workspace } from '../../../browser'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { documentsQueue } from '../../../jobs/queues'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
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
}): PromisedResult<undefined> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  // TODO(latte): Check latte credits

  await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    threadUuid,
    message,
    context,
    userId: user.id,
    debugVersionUuid,
  } as RunLatteJobData)

  return Result.nil()
}
