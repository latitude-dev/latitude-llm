import { type Message } from '@latitude-data/constants'

import { LogSources, Workspace } from '../../../browser'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { findPausedChain } from './findPausedChain'
import { resumePausedPrompt } from './resumePausedPrompt'
import { addChatMessage } from './addChatMessage'
import { resumeAgent } from './resumeAgent'
import { scanDocumentContent } from '../../documents'
import { Result } from './../../../lib/Result'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

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
  if (dataResult.error) return dataResult
  const { commit, document, providerLog, globalConfig } = dataResult.unwrap()

  const chainCacheData = await findPausedChain({ workspace, documentLogUuid })

  if (chainCacheData) {
    return resumePausedPrompt({
      workspace,
      commit,
      document,
      globalConfig,
      pausedChain: chainCacheData.pausedChain,
      previousResponse: chainCacheData.previousResponse,
      responseMessages: messages,
      documentLogUuid,
      source,
      abortSignal,
    })
  }

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
