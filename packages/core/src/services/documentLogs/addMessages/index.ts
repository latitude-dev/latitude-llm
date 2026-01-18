import { NotFoundError } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { type Message } from '@latitude-data/constants/legacyCompiler'
import { CompletionSpanMetadata, LogSources } from '../../../constants'
import { unsafelyFindProviderApiKey } from '../../../data-access/providerApiKeys'
import { Result } from '../../../lib/Result'
import { ToolHandler } from '../../documents/tools/clientTools/handlers'
import { DefaultStreamManager } from '../../../lib/streamManager/defaultStreamManager'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
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
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import { adaptPromptlMessageToLegacy } from '../../../utils/promptlAdapter'

type AddMessagesArgs = {
  workspace: WorkspaceDto
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
  tools?: Record<string, ToolHandler>
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
  const {
    document,
    commit,
    providerId,
    previousMessages,
    globalConfig,
    previousSpan,
  } = dataResult.unwrap()

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

  if (!providerId) {
    const error = new NotFoundError(
      'Cannot add messages to a conversation that has no associated provider',
    )
    $chat.fail(error)
    return Result.error(error)
  }

  const provider = await unsafelyFindProviderApiKey(providerId)
  if (!provider) {
    const error = new NotFoundError(
      `Could not find provider API key with id ${providerId}`,
    )
    $chat.fail(error)
    return Result.error(error)
  }

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
  if (!documentLogUuid) {
    return Result.error(new NotFoundError('documentLogUuid is required'))
  }

  const spansRepo = new SpansRepository(workspace.id)
  const previousSpan =
    await spansRepo.findLastMainSpanByDocumentLogUuid(documentLogUuid)
  if (!previousSpan) {
    return Result.error(
      new NotFoundError(
        `No span found for documentLogUuid ${documentLogUuid}`,
      ),
    )
  }

  if (!previousSpan.commitUuid || !previousSpan.documentUuid) {
    return Result.error(
      new NotFoundError('Span missing commitUuid or documentUuid'),
    )
  }

  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.getCommitByUuid({
    uuid: previousSpan.commitUuid,
    projectId: previousSpan.projectId!,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.value

  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsRepo.getDocumentAtCommit({
    commitUuid: commit.uuid,
    documentUuid: previousSpan.documentUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  const metadataResult = await scanDocumentContent({
    document,
    commit,
  })
  if (metadataResult.error) return metadataResult
  const globalConfig = metadataResult.value.config as LatitudePromptConfig

  const traceResult = await assembleTraceWithMessages({
    traceId: previousSpan.traceId,
    workspace,
  })
  if (!Result.isOk(traceResult)) {
    return Result.error(traceResult.error)
  }

  const { completionSpan } = traceResult.unwrap()
  if (!completionSpan || !completionSpan.metadata) {
    return Result.error(
      new NotFoundError('No completion span with metadata found'),
    )
  }

  const completionMetadata = completionSpan.metadata as CompletionSpanMetadata
  const inputMessages = (completionMetadata.input || []).map(
    adaptPromptlMessageToLegacy,
  )
  const outputMessages = (completionMetadata.output || []).map(
    adaptPromptlMessageToLegacy,
  )
  const previousMessages = [...inputMessages, ...outputMessages] as Message[]

  let providerId: number | undefined
  if (completionMetadata.provider) {
    const providerApiKeysRepo = new ProviderApiKeysRepository(workspace.id)
    const providerKeyResult = await providerApiKeysRepo.findByName(
      completionMetadata.provider,
    )
    if (Result.isOk(providerKeyResult)) {
      providerId = providerKeyResult.unwrap().id
    }
  }

  return Result.ok({
    commit,
    document,
    providerId,
    previousMessages,
    globalConfig,
    previousSpan,
  })
}
