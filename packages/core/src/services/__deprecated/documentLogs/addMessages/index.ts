import { type Message } from '@latitude-data/compiler'

import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { LogSources, Workspace } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '../../../../repositories'
import { scanDocumentContent } from '../../../documents'
import { getCachedChain } from '../../chains/chainCache'
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
  if (!Result.isOk(logResult)) return logResult
  const documentLog = logResult.value

  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.find(documentLog.commitId)
  if (!Result.isOk(commitResult)) return commitResult
  const commit = commitResult.value

  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsRepo.getDocumentAtCommit({
    commitUuid: commit?.uuid,
    documentUuid: documentLog.documentUuid,
  })
  if (!Result.isOk(documentResult)) return documentResult
  const document = documentResult.value

  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)
  if (!Result.isOk(providerLogResult)) return providerLogResult
  const providerLog = providerLogResult.value

  const metadataResult = await scanDocumentContent({
    workspaceId: workspace.id,
    document,
    commit,
  })
  if (!Result.isOk(metadataResult)) return metadataResult
  const globalConfig = metadataResult.value.config as LatitudePromptConfig

  return Result.ok({ commit, document, providerLog, globalConfig })
}

export async function addMessagesLegacy({
  workspace,
  documentLogUuid,
  messages,
  source,
  abortSignal,
}: {
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
  if (!Result.isOk(dataResult)) return dataResult
  const { commit, document, providerLog, globalConfig } = dataResult.unwrap()

  const chainCacheData = await getCachedChain({ workspace, documentLogUuid })

  // Resume from client tools in running chain (agent can have a chain inside)
  if (chainCacheData) {
    return resumePausedPrompt({
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
