import { type Message } from '@latitude-data/compiler'

import { LogSources, Workspace } from '../../../browser'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { findPausedChain } from './findPausedChain'
import { Result } from '../../../lib'
import { resumePausedPrompt } from './resumePausedPrompt'
import { addChatMessage } from './addChatMessage'
import { resumeAgent } from './resumeAgent'

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

  return Result.ok({ commit, document, providerLog })
}

export async function addMessages({
  workspace,
  documentLogUuid,
  messages,
  source,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
}) {
  if (!documentLogUuid) {
    return Result.error(new Error('documentLogUuid is required'))
  }

  const dataResult = await retrieveData({
    workspace,
    documentLogUuid,
  })
  if (dataResult.error) return dataResult
  const { commit, document, providerLog } = dataResult.unwrap()

  const chainCacheData = await findPausedChain({ workspace, documentLogUuid })

  if (chainCacheData) {
    return resumePausedPrompt({
      workspace,
      commit,
      document,
      pausedChain: chainCacheData.pausedChain,
      previousResponse: chainCacheData.previousResponse,
      responseMessages: messages,
      documentLogUuid,
      source,
    })
  }

  if (document.documentType === 'agent') {
    return resumeAgent({
      workspace,
      providerLog,
      messages,
      source,
      promptSource: {
        document,
        commit,
      },
    })
  }

  return addChatMessage({
    workspace,
    providerLog,
    messages,
    source,
    promptSource: {
      document,
      commit,
    },
  })
}
