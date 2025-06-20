import { type Message } from '@latitude-data/compiler'

import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { LogSources, Workspace } from '../../../browser'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { TelemetryContext } from '../../../telemetry'
import { getCachedChain } from '../../chains/chainCache'
import { scanDocumentContent } from '../../documents'
import { Result } from './../../../lib/Result'
import { addChatMessage } from './addChatMessage'
import { resumeAgent } from './resumeAgent'
import { resumePausedPrompt } from './resumePausedPrompt'

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
    workspaceId: workspace.id,
    document,
    commit,
  })
  if (metadataResult.error) return metadataResult
  const globalConfig = metadataResult.value.config as LatitudePromptConfig

  return Result.ok({ commit, document, providerLog, globalConfig })
}

export async function addMessages({
  context,
  workspace,
  documentLogUuid,
  messages,
  source,
  abortSignal,
}: {
  context: TelemetryContext
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
  abortSignal?: AbortSignal
}) {
  if (!documentLogUuid) {
    return Result.error(new Error('documentLogUuid is required'))
  }

  const dataResult = await retrieveData({
    workspace,
    documentLogUuid,
  })
  if (dataResult.error) return dataResult
  const { commit, document, providerLog, globalConfig } = dataResult.unwrap()

  const chainCacheData = await getCachedChain({ workspace, documentLogUuid })

  // Resume from client tools in running chain (agent can have a chain inside)
  if (chainCacheData) {
    return resumePausedPrompt({
      context,
      workspace,
      commit,
      document,
      globalConfig,
      pausedChain: chainCacheData.chain,
      previousResponse: chainCacheData.previousResponse,
      responseMessages: messages,
      documentLogUuid,
      source,
      abortSignal,
    })
  }

  /* Chain already finished running */

  // Follow up messages or resume from client tools
  if (document.documentType === 'agent') {
    return resumeAgent({
      context,
      workspace,
      providerLog,
      globalConfig,
      messages,
      source,
      promptSource: {
        document,
        commit,
      },
      abortSignal,
    })
  }

  // Follow up messages
  return addChatMessage({
    context,
    abortSignal,
    workspace,
    providerLog,
    globalConfig,
    messages,
    source,
    promptSource: {
      document,
      commit,
    },
  })
}
