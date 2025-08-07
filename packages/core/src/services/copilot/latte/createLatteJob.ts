import type { User, Workspace } from '../../../browser'
import type { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { documentsQueue } from '../../../jobs/queues'
import { assertCopilotIsSupported } from './helpers'
import type { PromisedResult } from '../../../lib/Transaction'
import { type ErrorResult, Result } from '../../../lib/Result'
import type { LatitudeError } from '@latitude-data/constants/errors'

export async function createLatteJob({
  workspace,
  threadUuid,
  message,
  context,
  user,
}: {
  workspace: Workspace
  threadUuid: string
  message: string
  context: string
  user: User
}): PromisedResult<undefined> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    threadUuid,
    message,
    context,
    userId: user.id,
  } as RunLatteJobData)

  return Result.nil()
}
