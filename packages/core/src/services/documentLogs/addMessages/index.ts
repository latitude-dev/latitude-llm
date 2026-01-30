import { NotFoundError } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { type Message } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '../../../constants'
import { isRetryableError } from '../../../lib/isRetryableError'
import { Result } from '../../../lib/Result'
import { DefaultStreamManager } from '../../../lib/streamManager/defaultStreamManager'
import {
  CommitsRepository,
  DocumentVersionsRepository,
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
import { ToolHandler } from '../../documents/tools/clientTools/handlers'
import { unsafelyFindProviderApiKey } from '../../providerApiKeys/data-access/providerApiKeys'
import { readConversationCache } from '../../conversations/cache'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import { adaptCompletionSpanMessagesToLegacy } from '../../tracing/spans/fetching/findCompletionSpanFromTrace'

type AddMessagesArgs = {
  workspace: WorkspaceDto
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
  tools?: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  abortSignal?: AbortSignal
  context?: TelemetryContext
  testDeploymentId?: number
}

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
  if (!documentLogUuid)
    return Result.error(new Error('documentLogUuid is required'))

  const dataResult = await retrieveData({
    workspace,
    documentLogUuid,
  })
  if (dataResult.error) return dataResult

  const {
    document,
    commit,
    provider,
    globalConfig,
    previousSpan,
    previousMessages,
  } = dataResult.unwrap()
  const effectiveContext = context ?? BACKGROUND({ workspaceId: workspace.id })
  const $chat = telemetry.span.chat(
    {
      documentLogUuid,
      versionUuid: commit.uuid,
      promptUuid: document.documentUuid,
      previousTraceId: previousSpan?.traceId ?? '',
      name: document.path.split('/').at(-1),
      source,
    },
    effectiveContext,
  )

  const conversation = {
    config: globalConfig,
    messages: [...previousMessages, ...messages],
  }

  const streamManager = new DefaultStreamManager({
    context: $chat.context,
    uuid: documentLogUuid,
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

      if (isRetryableError(error)) return response
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
  documentLogUuid: string
}) {
  const spansRepo = new SpansRepository(workspace.id)
  const previousSpan = documentLogUuid
    ? await spansRepo.findLastMainSpanByDocumentLogUuid(documentLogUuid)
    : undefined

  const cacheResult = await readConversationCache({
    workspaceId: workspace.id,
    documentLogUuid,
  })
  if (cacheResult.error) return cacheResult

  const cachedConversation = cacheResult.value

  const commitUuid = cachedConversation?.commitUuid ?? previousSpan?.commitUuid
  const documentUuid =
    cachedConversation?.documentUuid ?? previousSpan?.documentUuid

  if (!commitUuid || !documentUuid) {
    return Result.error(
      new NotFoundError(
        'Cannot add messages to a conversation without commit or document details',
      ),
    )
  }

  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.getCommitByUuid({
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.value

  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsRepo.getDocumentAtCommit({
    commitUuid: commit.uuid,
    documentUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  const metadataResult = await scanDocumentContent({
    document,
    commit,
  })
  if (metadataResult.error) return metadataResult
  const globalConfig = metadataResult.value.config as LatitudePromptConfig

  const provider = await resolveProvider({
    workspace,
    providerId: cachedConversation?.providerId,
    config: globalConfig,
  })
  if (provider.error) return provider

  const previousMessages =
    cachedConversation?.messages ??
    (await getMessagesFromSpan({
      workspace,
      span: previousSpan,
    }))

  return Result.ok({
    commit,
    document,
    provider: provider.unwrap(),
    globalConfig,
    previousSpan,
    previousMessages,
  })
}

async function resolveProvider({
  workspace,
  providerId,
  config,
}: {
  workspace: WorkspaceDto
  providerId?: number
  config: LatitudePromptConfig
}) {
  if (providerId) {
    const provider = await unsafelyFindProviderApiKey(providerId)
    if (!provider) {
      return Result.error(
        new NotFoundError(
          `Could not find provider API key with id ${providerId}`,
        ),
      )
    }

    return Result.ok(provider)
  }

  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const provider = providersMap.get(config.provider)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        `Could not find provider API key for ${config.provider}`,
      ),
    )
  }

  return Result.ok(provider)
}

async function getMessagesFromSpan({
  workspace,
  span,
}: {
  workspace: WorkspaceDto
  span: Awaited<
    ReturnType<SpansRepository['findLastMainSpanByDocumentLogUuid']>
  >
}) {
  if (!span?.traceId) return []

  const traceResult = await assembleTraceWithMessages({
    traceId: span.traceId,
    workspace,
  })
  if (traceResult.error) return []

  const { completionSpan } = traceResult.value
  return adaptCompletionSpanMessagesToLegacy(completionSpan)
}
