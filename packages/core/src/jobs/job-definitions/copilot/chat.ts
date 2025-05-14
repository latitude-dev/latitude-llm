import { Job } from 'bullmq'

import {
  CommitsRepository,
  DocumentLogsRepository,
} from '../../../repositories'
import {
  addMessageToExistingCopilotChat,
  runNewCopilotChat,
} from '../../../services/copilot/chat'
import {
  unsafelyFindProject,
  unsafelyFindWorkspace,
} from '../../../data-access'
import { ContentType, Message, MessageRole } from '@latitude-data/compiler'
import { getCopilotDocument } from '../../../services/copilot/chat/helpers'
import { WebsocketClient } from '../../../websockets/workers'

export type RunCopilotChatJobData = {
  workspaceId: number
  projectId: number
  commitId: number
  chatUuid: string
  message: string
}

export const runCopilotChatJob = async (job: Job<RunCopilotChatJobData>) => {
  console.log('LATTE JOB CREATED')
  const { workspaceId, projectId, commitId, chatUuid, message } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId).then((w) => w!)
  const websockets = await WebsocketClient.getSocket()

  try {
    const project = await unsafelyFindProject(projectId).then((p) => p!)

    const commitScope = new CommitsRepository(workspace.id)
    const commitResult = await commitScope.find(commitId)
    const commit = commitResult.unwrap()

    const copilotResult = await getCopilotDocument()
    const {
      workspace: copilotWorkspace,
      commit: copilotCommit,
      document: copilotDocument,
    } = copilotResult.unwrap()

    const documentLogsScope = new DocumentLogsRepository(copilotWorkspace.id)
    const documentLogResult = await documentLogsScope.findByUuid(chatUuid)

    if (!documentLogResult.ok) {
      // Chat still does not exist, we create a new one
      await runNewCopilotChat({
        websockets,
        copilotWorkspace,
        copilotCommit,
        copilotDocument,
        clientWorkspace: workspace,
        clientProject: project,
        clientCommit: commit,
        chatUuid,
        message,
      }).then((r) => r.unwrap())

      return
    }

    const messages: Message[] = [
      {
        role: MessageRole.user,
        content: [
          {
            type: ContentType.text,
            text: message,
          },
        ],
      },
    ]
    await addMessageToExistingCopilotChat({
      websockets,
      copilotWorkspace,
      copilotCommit,
      copilotDocument,
      clientWorkspace: workspace,
      clientProject: project,
      clientCommit: commit,
      chatUuid,
      messages,
    }).then((r) => r.unwrap())
  } catch (err) {
    console.log('LATTE FAILED :(')
    const error = err as Error
    websockets.emit('latteError', {
      workspaceId: workspace.id,
      data: {
        chatUuid,
        error: error.message,
      },
    })
  }
}
