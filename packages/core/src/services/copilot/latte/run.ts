import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { Commit, DocumentVersion, User, Workspace } from '../../../browser'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { BACKGROUND, TelemetryContext } from '../../../telemetry'
import { captureException } from '../../../utils/workers/sentry'
import { WebsocketClient } from '../../../websockets/workers'
import { runDocumentAtCommit } from '../../commits'
import { addMessages } from '../../documentLogs/addMessages/index'
import { checkLatteCredits } from './credits/check'
import { consumeLatteCredits } from './credits/consume'
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
}

type generateLatteResponseArgs = {
  context: TelemetryContext
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first "new" request
  messages?: Message[] // for subsequent "add" requests
  user: User
}

async function generateLatteResponse(args: generateLatteResponseArgs) {
  const checking = await checkLatteCredits({ workspace: args.clientWorkspace })
  if (checking.error) {
    return Result.error(checking.error)
  }

  let usage, error
  try {
    const run = await innerGenerateLatteResponse(args).then((r) => r.unwrap())
    usage = await run.runUsage
    error = await run.error
  } catch (exception) {
    error = exception as Error
  }

  const consuming = await consumeLatteCredits({
    usage: usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    threadUuid: args.threadUuid,
    error: error,
    user: args.user,
    workspace: args.clientWorkspace,
  }) // Note: failing silently
  if (consuming.error) {
    captureException(consuming.error)
  }

  if (error) {
    WebsocketClient.sendEvent('latteThreadUpdate', {
      workspaceId: args.clientWorkspace.id,
      data: {
        threadUuid: args.threadUuid,
        type: 'error',
        error: {
          name: error.name,
          message: error.message,
        },
      },
    })
  }

  return Result.nil()
}

async function innerGenerateLatteResponse({
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

  return Result.ok(run)
}
