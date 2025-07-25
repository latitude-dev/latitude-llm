import { Job } from 'bullmq'

import { unsafelyFindWorkspace } from '../../../data-access'
import { LatitudeError } from '../../../lib/errors'
import { DocumentLogsRepository, UsersRepository } from '../../../repositories'
import {
  addMessageToExistingLatte,
  runNewLatte,
} from '../../../services/copilot/latte'
import { getCopilotDocument } from '../../../services/copilot/latte/helpers'
import { WebsocketClient } from '../../../websockets/workers'

export type RunLatteJobData = {
  workspaceId: number
  userId: string
  threadUuid: string
  message: string
  context: string
}

async function emitError({
  workspaceId,
  threadUuid,
  error,
}: {
  workspaceId: number
  threadUuid: string
  error: LatitudeError
}) {
  WebsocketClient.sendEvent('latteError', {
    workspaceId,
    data: {
      threadUuid,
      error: error.message,
    },
  })
}

export const runLatteJob = async (job: Job<RunLatteJobData>) => {
  const { workspaceId, userId, threadUuid, message, context } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId).then((w) => w!)

  const usersScope = new UsersRepository(workspace.id)
  const userResult = await usersScope.find(userId)
  if (!userResult.ok) {
    await emitError({
      workspaceId,
      threadUuid,
      error: userResult.error as LatitudeError,
    })
    return userResult
  }
  const user = userResult.unwrap()

  const copilotResult = await getCopilotDocument()
  if (!copilotResult.ok) {
    await emitError({
      workspaceId,
      threadUuid,
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
  const documentLogResult = await documentLogsScope.findByUuid(threadUuid)

  if (!documentLogResult.ok) {
    // Chat still does not exist, we create a new one
    const runResult = await runNewLatte({
      copilotWorkspace,
      copilotCommit,
      copilotDocument,
      clientWorkspace: workspace,
      user,
      threadUuid,
      message,
      context,
    })

    if (!runResult.ok) {
      await emitError({
        workspaceId,
        threadUuid,
        error: runResult.error as LatitudeError,
      })
    }

    return runResult
  }

  const runResult = await addMessageToExistingLatte({
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace: workspace,
    user,
    threadUuid,
    message,
    context,
  })

  if (!runResult.ok) {
    await emitError({
      workspaceId,
      threadUuid,
      error: runResult.error as LatitudeError,
    })
  }

  return runResult
}
