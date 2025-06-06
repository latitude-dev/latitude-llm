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
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { documentsQueue } from '../../../jobs/queues'
import { RunCopilotChatJobData } from '../../../jobs/job-definitions/copilot/chat'
import { handleToolRequest } from './tools'
import { LatteContext } from '@latitude-data/constants/latte'
import { getContextString } from './context'
import { WebsocketClient } from '../../../websockets/workers'

async function generateCopilotResponse({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  chatUuid,
  initialParameters,
  messages,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  chatUuid: string
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
        errorableUuid: chatUuid,
      })
    : await addMessages({
        workspace: copilotWorkspace,
        documentLogUuid: chatUuid,
        messages: messages!,
        source: LogSources.API,
      })
  if (!runResult.ok) return runResult as ErrorResult<LatitudeError>
  const run = runResult.unwrap()

  await sendWebsockets({
    workspace: clientWorkspace,
    chatUuid,
    stream: run.stream,
  })

  const runError = await run.error
  if (runError) {
    return Result.error(runError)
  }

  const [agentToolCalls, otherToolCalls] = extractAgentToolCalls(
    await run.toolCalls,
  )

  let toolMessages: ToolMessage[]
  try {
    toolMessages = await Promise.all(
      otherToolCalls.map(async (toolCall) => {
        const r = await handleToolRequest({
          workspace: clientWorkspace,
          tool: toolCall,
          onFinish: async (msg) => {
            WebsocketClient.sendEvent('latteMessage', {
              workspaceId: clientWorkspace.id,
              data: { chatUuid, message: msg },
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
      chatUuid,
      messages: toolMessages,
    })
  }

  // Agent returned a response. The run flow has finished.
  return Result.nil()
}

export async function runNewCopilotChat({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  chatUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  chatUuid: string
  message: string
  context: LatteContext
}): PromisedResult<undefined> {
  const contextAsString = await getContextString({
    workspace: clientWorkspace,
    context,
  })
  if (!contextAsString.ok) {
    return contextAsString as ErrorResult<LatitudeError>
  }

  return generateCopilotResponse({
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    chatUuid,
    initialParameters: { message, context: contextAsString.unwrap() },
  })
}

export async function addMessageToExistingCopilotChat({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  chatUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  chatUuid: string
  message: string
  context: LatteContext
}): PromisedResult<undefined> {
  const contextAsString = await getContextString({
    workspace: clientWorkspace,
    context,
  })
  if (!contextAsString.ok) {
    return contextAsString as ErrorResult<LatitudeError>
  }

  const userMessage: UserMessage = {
    role: MessageRole.user,
    content: [
      {
        type: ContentType.text,
        text: contextAsString.unwrap(),
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
    chatUuid,
    messages: [userMessage],
  })
}

export async function createCopilotChatJob({
  workspace,
  chatUuid,
  message,
  context,
}: {
  workspace: Workspace
  chatUuid?: string
  message: string
  context: LatteContext
}): PromisedResult<{ uuid: string }> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  const uuid = chatUuid ?? generateUUIDIdentifier()
  await documentsQueue.add('runCopilotChatJob', {
    workspaceId: workspace.id,
    chatUuid: uuid,
    message,
    context,
  } as RunCopilotChatJobData)
  return Result.ok({ uuid })
}
