import {
  ContentType,
  Message,
  MessageRole,
  ToolMessage,
  UserMessage,
} from '@latitude-data/compiler'
import { addMessages } from '../../documentLogs/addMessages'
import { ErrorResult, Result } from '../../../lib/Result'
import { LatitudeError } from '../../../lib/errors'
import { PromisedResult } from '../../../lib/Transaction'
import { runDocumentAtCommit } from '../../commits'
import { extractAgentToolCalls, LogSources } from '@latitude-data/constants'
import { Commit, Workspace, DocumentVersion } from '../../../browser'
import { assertCopilotIsSupported, sendWebsockets } from './helpers'
import { documentsQueue } from '../../../jobs/queues'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { handleToolRequest } from './tools'
import { WebsocketClient } from '../../../websockets/workers'

async function generateCopilotResponse({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  initialParameters,
  messages,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first “new” request
  messages?: Message[] // for subsequent “add” requests
}): PromisedResult<undefined> {
  const runResult = initialParameters
    ? await runDocumentAtCommit({
        workspace: copilotWorkspace,
        commit: copilotCommit,
        document: copilotDocument,
        customIdentifier: String(clientWorkspace.id),
        parameters: initialParameters,
        source: LogSources.API,
        errorableUuid: threadUuid,
      })
    : await addMessages({
        workspace: copilotWorkspace,
        documentLogUuid: threadUuid,
        messages: messages!,
        source: LogSources.API,
      })
  if (!runResult.ok) return runResult as ErrorResult<LatitudeError>
  const run = runResult.unwrap()

  await sendWebsockets({
    workspace: clientWorkspace,
    threadUuid,
    stream: run.stream,
  })

  const runError = await run.error
  if (runError) {
    return Result.error(runError)
  }

  const [agentToolCalls, otherToolCalls] = extractAgentToolCalls(
    await run.toolCalls,
  )

  let toolResponseMessages: ToolMessage[]
  try {
    toolResponseMessages = await Promise.all(
      otherToolCalls.map(async (toolCall) => {
        const r = await handleToolRequest({
          threadUuid,
          tool: toolCall,
          workspace: clientWorkspace,
          messages: await run.messages,
          onFinish: async (msg) => {
            WebsocketClient.sendEvent('latteMessage', {
              workspaceId: clientWorkspace.id,
              data: { threadUuid, message: msg },
            })
          },
        })
        return r.unwrap()
      }),
    )
  } catch (error) {
    return Result.error(error as LatitudeError)
  }

  if (agentToolCalls.length === 0) {
    // Agent did not return a response. We add the tool responses and keep iterating
    await run.lastResponse // Await for the response to be fully processed
    return generateCopilotResponse({
      copilotWorkspace,
      copilotCommit,
      copilotDocument,
      clientWorkspace,
      threadUuid,
      messages: toolResponseMessages,
    })
  }

  // Agent returned a response. The run flow has finished.
  return Result.nil()
}

export async function runNewLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  return generateCopilotResponse({
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    threadUuid,
    initialParameters: { message, context },
  })
}

export async function addMessageToExistingLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  const userMessage: UserMessage = {
    role: MessageRole.user,
    content: [
      {
        type: ContentType.text,
        text: context,
      },
      {
        type: ContentType.text,
        text: message,
      },
    ],
  }

  return generateCopilotResponse({
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    threadUuid,
    messages: [userMessage],
  })
}

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
