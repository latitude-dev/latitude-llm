import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { Commit, DocumentVersion, User, Workspace } from '../../../browser'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { BACKGROUND, TelemetryContext } from '../../../telemetry'
import { WebsocketClient } from '../../../websockets/workers'
import { runDocumentAtCommit } from '../../commits'
import { addMessages } from '../../documentLogs/addMessages/index'
import { sendWebsockets } from './helpers'
import { buildToolHandlers } from './tools'

export async function runNewLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  message,
  context,
  user,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  message: string
  context: string
  user: User
}): PromisedResult<undefined> {
  // TODO(latte): Check latte credits

  return generateLatteResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    threadUuid,
    user,
    initialParameters: { message, context },
  })

  // TODO(latte): Consume latte credits
}

async function generateLatteResponse({
  context,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  initialParameters,
  messages,
  user,
}: {
  context: TelemetryContext
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first "new" request
  messages?: Message[] // for subsequent "add" requests
  user: User
}) {
  const tools = buildToolHandlers({
    user,
    workspace: clientWorkspace,
    threadUuid,
  })

  const runResult = initialParameters
    ? await runDocumentAtCommit({
        context: context,
        workspace: copilotWorkspace,
        commit: copilotCommit,
        document: copilotDocument,
        customIdentifier: String(clientWorkspace.id),
        parameters: initialParameters,
        source: LogSources.API,
        errorableUuid: threadUuid,
        tools,
      })
    : await addMessages({
        context: context,
        workspace: copilotWorkspace,
        documentLogUuid: threadUuid,
        messages: messages!,
        source: LogSources.API,
        tools,
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
    WebsocketClient.sendEvent('latteThreadUpdate', {
      workspaceId: clientWorkspace.id,
      data: {
        threadUuid,
        type: 'error',
        error: {
          name: runError.name,
          message: runError.message,
        },
      },
    })
    return Result.error(runError)
  }

  return Result.nil()
}
