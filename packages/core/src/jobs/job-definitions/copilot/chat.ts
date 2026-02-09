import { Job } from 'bullmq'

import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { clearCancelJobFlag, isJobCancelled } from '../../../lib/cancelJobs'
import { LatitudeError } from '../../../lib/errors'
import {
  ProjectsRepository,
  SpansRepository,
  UsersRepository,
} from '../../../repositories'
import {
  addMessageToExistingLatte,
  runNewLatte,
} from '../../../services/copilot/latte/addMessage'
import { getCopilotDocument } from '../../../services/copilot/latte/helpers'
import { WebsocketClient } from '../../../websockets/workers'

export type RunLatteJobData = {
  workspaceId: number
  projectId: number
  userId: string
  threadUuid: string
  message: string
  context: string
  debugVersionUuid?: string
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
  const {
    workspaceId,
    projectId,
    userId,
    threadUuid,
    message,
    context,
    debugVersionUuid,
  } = job.data

  const controller = new AbortController()

  // TODO: Find more efficient way using websockets
  const interval = setInterval(async () => {
    if (job.id && (await isJobCancelled(job.id))) controller.abort()
  }, 500)

  try {
    const workspace = await unsafelyFindWorkspace(workspaceId).then((w) => w!)

    const projectRepo = new ProjectsRepository(workspace.id)
    const projectResult = await projectRepo.find(projectId)
    if (projectResult.error) {
      await emitError({ workspaceId, threadUuid, error: projectResult.error })
      return projectResult
    }
    const project = projectResult.value

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

    const copilotResult = await getCopilotDocument(debugVersionUuid)
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

    const spansRepo = new SpansRepository(copilotWorkspace.id)
    const existingSpan = await spansRepo.findByDocumentLogUuid(threadUuid)
    if (!existingSpan) {
      const runResult = await runNewLatte({
        copilotWorkspace,
        copilotCommit,
        copilotDocument,
        clientWorkspace: workspace,
        clientProject: project,
        user,
        threadUuid,
        message,
        context,
        abortSignal: controller.signal,
        debugVersionUuid,
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
      clientProject: project,
      user,
      threadUuid,
      message,
      context,
      abortSignal: controller.signal,
      debugVersionUuid,
    })
    if (!runResult.ok) {
      await emitError({
        workspaceId,
        threadUuid,
        error: runResult.error as LatitudeError,
      })
    }

    return runResult
  } finally {
    clearInterval(interval)
    if (job.id && (await isJobCancelled(job.id))) {
      await clearCancelJobFlag(job.id)
    }
  }
}
