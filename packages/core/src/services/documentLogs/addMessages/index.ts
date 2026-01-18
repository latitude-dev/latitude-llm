import { NotFoundError } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { type Message } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '../../../constants'
import { unsafelyFindProviderApiKey } from '../../../data-access/providerApiKeys'
import { buildConversation } from '../../../helpers'
import { Result } from '../../../lib/Result'
import { ToolHandler } from '../../documents/tools/clientTools/handlers'
import { DefaultStreamManager } from '../../../lib/streamManager/defaultStreamManager'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
  SpansRepository,
} from '../../../repositories'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import {
  BACKGROUND,
  type LatitudeTelemetry,
  telemetry as realTelemetry,
  TelemetryContext,
} from '../../../telemetry'
import { getInputSchema, getOutputType } from '../../chains/ChainValidator'
import { scanDocumentContent } from '../../documents'
import { isErrorRetryable } from '../../evaluationsV2/run'
import serializeProviderLog from '../../providerLogs/serialize'

type AddMessagesArgs = {
  workspace: WorkspaceDto
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
  tools?: Record<string, ToolHandler>
  mcpHeaders?: Record<string, string>
  abortSignal?: AbortSignal
  context?: TelemetryContext
  testDeploymentId?: number
}

/**
 * TODO(LegacyProviderLogs) BIG BEAUTIFUL REFACTOR NEEDED
 *
 * We migrated from documentLogs and providerLogs
 * long time ago. But we're still using it for doing chat
 *
 * I guess this is related with the async nature of traces.
 * We need to address this at some point.
 *
 * Look for other related todos. The main AI streaming is still
 * creating `providerLogs`.
 */
export async function addMessages(
  {
    workspace,
    documentLogUuid,
    messages,
    source,
    abortSignal,
    tools = {},
    mcpHeaders,
    context = BACKGROUND({ workspaceId: workspace.id }),
  }: AddMessagesArgs,
  telemetry: LatitudeTelemetry = realTelemetry,
) {
  if (!documentLogUuid) {
    return Result.error(new Error('documentLogUuid is required'))
  }

  const dataResult = await retrieveData({
    workspace,
    documentLogUuid,
  })
  if (dataResult.error) return dataResult
  const { document, commit, providerLog, globalConfig, previousSpan } =
    dataResult.unwrap()

  const effectiveContext = context ?? BACKGROUND({ workspaceId: workspace.id })

  const $chat = telemetry.span.chat(
    {
      documentLogUuid,
      previousTraceId: previousSpan?.traceId ?? '',
      name: document.path.split('/').at(-1),
      source,
    },
    effectiveContext,
  )

  if (!providerLog.providerId) {
    const error = new NotFoundError(
      'Cannot add messages to a conversation that has no associated provider',
    )
    $chat.fail(error)
    return Result.error(error)
  }

  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    const error = new NotFoundError(
      `Could not find provider API key with id ${providerLog.providerId}`,
    )
    $chat.fail(error)
    return Result.error(error)
  }

  // TODO: store messages in provider log and forget about manually handling
  // response messages
  const previousMessages = buildConversation(serializeProviderLog(providerLog))
  const conversation = {
    config: globalConfig,
    messages: [...previousMessages, ...messages],
  }

  const streamManager = new DefaultStreamManager({
    context: $chat.context,
    uuid: providerLog.documentLogUuid!,
    config: conversation.config,
    provider,
    output: getOutputType(conversation)!,
    schema: getInputSchema(conversation)!,
    messages: conversation.messages,
    promptSource: {
      document,
      commit,
    },
    source,
    workspace,
    tools,
    mcpHeaders,
    abortSignal,
  })

  const { start, ...streamResult } = streamManager.prepare()

  start()

  streamResult.response.then(async (response) => {
    const error = await streamResult.error
    if (error) {
      $chat.fail(error)

      if (isErrorRetryable(error)) return response
    } else {
      $chat.end()
    }
  })

  return Result.ok(streamResult)
}

async function retrieveData({
  workspace,
  documentLogUuid,
}: {
  workspace: WorkspaceDto
  documentLogUuid: string | undefined
}) {
  const logsRepo = new DocumentLogsRepository(workspace.id)
  const logResult = await logsRepo.findByUuid(documentLogUuid)
  if (logResult.error) return logResult
  const documentLog = logResult.value

  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.find(documentLog.commitId)
  if (commitResult.error) return commitResult
  const commit = commitResult.value

  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsRepo.getDocumentAtCommit({
    commitUuid: commit?.uuid,
    documentUuid: documentLog.documentUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)
  if (providerLogResult.error) return providerLogResult
  const providerLog = providerLogResult.value

  const metadataResult = await scanDocumentContent({
    document,
    commit,
  })
  if (metadataResult.error) return metadataResult
  const globalConfig = metadataResult.value.config as LatitudePromptConfig

  const spansRepo = new SpansRepository(workspace.id)
  const previousSpan = documentLogUuid
    ? await spansRepo.findLastMainSpanByDocumentLogUuid(documentLogUuid)
    : undefined

  return Result.ok({
    commit,
    document,
    documentLog,
    providerLog,
    globalConfig,
    previousSpan,
  })
}
