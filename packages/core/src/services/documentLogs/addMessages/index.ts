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
} from '../../../repositories'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { BACKGROUND, telemetry, TelemetryContext } from '../../../telemetry'
import { getInputSchema, getOutputType } from '../../chains/ChainValidator'
import { scanDocumentContent } from '../../documents'
import { isErrorRetryable } from '../../evaluationsV2/run'
import serializeProviderLog from '../../providerLogs/serialize'

type AddMessagesArgs = {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
  tools?: Record<string, ToolHandler>
  abortSignal?: AbortSignal
  context?: TelemetryContext
  testDeploymentId?: number
}

export async function addMessages({
  workspace,
  documentLogUuid,
  messages,
  source,
  abortSignal,
  tools = {},
  context = BACKGROUND({ workspaceId: workspace.id }),
  testDeploymentId,
}: AddMessagesArgs) {
  if (!documentLogUuid) {
    return Result.error(new Error('documentLogUuid is required'))
  }

  const dataResult = await retrieveData({
    workspace,
    documentLogUuid,
  })
  if (dataResult.error) return dataResult
  const { document, commit, providerLog, globalConfig } = dataResult.unwrap()

  const $prompt = telemetry.prompt(context, {
    documentLogUuid,
    testDeploymentId,
    name: document.path.split('/').at(-1),
    promptUuid: document.documentUuid,
    template: document.content,
    versionUuid: commit.uuid,
  })

  if (!providerLog.providerId) {
    const error = new NotFoundError(
      'Cannot add messages to a conversation that has no associated provider',
    )
    $prompt.fail(error)
    return Result.error(error)
  }

  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    const error = new NotFoundError(
      `Could not find provider API key with id ${providerLog.providerId}`,
    )
    $prompt.fail(error)
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
    context: $prompt.context,
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
    abortSignal,
  })

  const { start, ...streamResult } = streamManager.prepare()

  start()

  streamResult.response.then(async (response) => {
    const error = await streamResult.error
    if (error) {
      $prompt.fail(error)

      if (isErrorRetryable(error)) return response
    } else {
      $prompt.end()
    }
  })

  return Result.ok(streamResult)
}

async function retrieveData({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
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

  return Result.ok({ commit, document, documentLog, providerLog, globalConfig })
}
