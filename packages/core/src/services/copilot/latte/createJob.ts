import { ErrorResult, Result } from '../../../lib/Result'
import type { Workspace } from '../../../browser'
import { LatitudeError } from '../../../lib/errors'
import { PromisedResult } from '../../../lib/Transaction'
import { assertCopilotIsSupported } from './helpers'
import { documentsQueue } from '../../../jobs/queues'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'

export async function createLatteJob({
  workspace,
  threadUuid,
  message,
  context,
}: {
  workspace: Workspace
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    threadUuid,
    message,
    context,
  } as RunLatteJobData)

  return Result.nil()
}
