import { Job } from 'bullmq'

import { DocumentLogsRepository } from '../../../repositories'
import {
  addMessageToExistingCopilotChat,
  runNewCopilotChat,
} from '../../../services/copilot/chat'
import { unsafelyFindWorkspace } from '../../../data-access'
import { getCopilotDocument } from '../../../services/copilot/chat/helpers'
import { WebsocketClient } from '../../../websockets/workers'
import { LatteContext } from '@latitude-data/constants/latte'
import { LatitudeError } from '../../../lib/errors'

export type RunCopilotChatJobData = {
  workspaceId: number
  chatUuid: string
  message: string
  context: LatteContext
}

async function emitError({
  workspaceId,
  chatUuid,
  error,
}: {
  workspaceId: number
  chatUuid: string
  error: LatitudeError
}) {
  WebsocketClient.sendEvent('latteError', {
    workspaceId,
    data: {
      chatUuid,
      error: error.message,
    },
  })
}

export const runCopilotChatJob = async (job: Job<RunCopilotChatJobData>) => {
  const { workspaceId, chatUuid, message, context } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId).then((w) => w!)

  const copilotResult = await getCopilotDocument()
  if (!copilotResult.ok) {
    await emitError({
      workspaceId,
      chatUuid,
      error: copilotResult.error as LatitudeError,
    })

    return copilotResult
  }
  const {
    workspace: copilotWorkspace,
    commit: copilotCommit,
    document: copilotDocument,
  } = copilotResult.unwrap()

  const documentLogsScope = new DocumentLogsRepository(copilotWorkspace.id)
  const documentLogResult = await documentLogsScope.findByUuid(chatUuid)

  if (!documentLogResult.ok) {
    // Chat still does not exist, we create a new one
    const runResult = await runNewCopilotChat({
      copilotWorkspace,
      copilotCommit,
      copilotDocument,
      clientWorkspace: workspace,

      chatUuid,
      message,
      context,
    })

    if (!runResult.ok) {
      await emitError({
        workspaceId,
        chatUuid,
        error: runResult.error as LatitudeError,
      })
    }

    return runResult
  }

  const runResult = await addMessageToExistingCopilotChat({
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace: workspace,
    chatUuid,
    message,
    context,
  })

  if (!runResult.ok) {
    await emitError({
      workspaceId,
      chatUuid,
      error: runResult.error as LatitudeError,
    })
  }

  return runResult
}
