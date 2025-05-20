import { Message } from '@latitude-data/compiler'
import { addMessages } from '../../documentLogs/addMessages'
import { ErrorResult, Result } from '../../../lib/Result'
import { LatitudeError } from '../../../lib/errors'
import { PromisedResult } from '../../../lib/Transaction'
import { runDocumentAtCommit } from '../../commits'
import { extractAgentToolCalls, LogSources } from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  DocumentVersion,
  buildAllMessagesFromResponse,
} from '../../../browser'
import { sendWebsockets } from './helpers'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { documentsQueue } from '../../../jobs/queues'
import { RunCopilotChatJobData } from '../../../jobs/job-definitions/copilot/chat'
import { WorkerSocket } from '../../../websockets/workers'
import { handleToolRequest } from './tools'

async function generateCopilotResponse({
  websockets,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  clientProject,
  clientCommit,
  chatUuid,
  initialMessage,
  messages: newMessages,
}: {
  websockets: WorkerSocket
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  clientCommit: Commit
  chatUuid: string
  initialMessage?: string // for the first “new” request
  messages?: Message[] // for subsequent “add” requests
}): PromisedResult<undefined> {
  console.log('running latte')
  const runResult = initialMessage
    ? await runDocumentAtCommit({
        workspace: copilotWorkspace,
        commit: copilotCommit,
        document: copilotDocument,
        customIdentifier: String(clientWorkspace.id),
        parameters: { message: initialMessage, query: initialMessage },
        source: LogSources.API,
        errorableUuid: chatUuid,
      })
    : await addMessages({
        workspace: copilotWorkspace,
        documentLogUuid: chatUuid,
        messages: newMessages!,
        source: LogSources.API,
      })
  if (!runResult.ok) return runResult as ErrorResult<LatitudeError>
  const run = runResult.unwrap()

  await sendWebsockets({
    websockets,
    workspace: clientWorkspace,
    chatUuid,
    stream: run.stream,
  })

  const [agentToolCalls, otherToolCalls] = extractAgentToolCalls(
    await run.toolCalls,
  )

  const response = await run.lastResponse
  const messages = buildAllMessagesFromResponse({ response: response! })

  const toolMessages = await Promise.all(
    otherToolCalls.map(async (toolCall) => {
      const r = await handleToolRequest({
        websockets,
        workspace: clientWorkspace,
        project: clientProject,
        commit: clientCommit,
        chatUuid,
        messages,
        tool: toolCall,
        onFinish: async (msg) => {
          websockets.emit('copilotChatMessage', {
            workspaceId: clientWorkspace.id,
            data: { chatUuid, message: msg },
          })
        },
      })
      return r.unwrap()
    }),
  )

  if (agentToolCalls.length === 0) {
    // Agent did not return a response. We add the tool responses and keep iterating
    return generateCopilotResponse({
      websockets,
      copilotWorkspace,
      copilotCommit,
      copilotDocument,
      clientWorkspace,
      clientProject,
      clientCommit,
      chatUuid,
      messages: toolMessages,
    })
  }

  // Agent returned a response. The run flow has finished.
  return Result.nil()
}

export async function runNewCopilotChat({
  websockets,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  clientProject,
  clientCommit,
  chatUuid,
  message,
}: {
  websockets: WorkerSocket
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  clientCommit: Commit
  chatUuid: string
  message: string
}): PromisedResult<undefined> {
  return generateCopilotResponse({
    websockets,
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    clientProject,
    clientCommit,
    chatUuid,
    initialMessage: message,
  })
}

export async function addMessageToExistingCopilotChat({
  websockets,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  clientProject,
  clientCommit,
  chatUuid,
  messages,
}: {
  websockets: WorkerSocket
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  clientCommit: Commit
  chatUuid: string
  messages: Message[]
}): PromisedResult<undefined> {
  return generateCopilotResponse({
    websockets,
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    clientProject,
    clientCommit,
    chatUuid,
    messages,
  })
}

export async function createCopilotChatJob({
  workspace,
  project,
  commit,
  message,
  chatUuid,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  message: string
  chatUuid?: string
}): PromisedResult<{ uuid: string }> {
  const uuid = chatUuid ?? generateUUIDIdentifier()
  await documentsQueue.add('runCopilotChatJob', {
    workspaceId: workspace.id,
    projectId: project.id,
    commitId: commit.id,
    chatUuid: uuid,
    message,
  } as RunCopilotChatJobData)
  return Result.ok({ uuid })
}
