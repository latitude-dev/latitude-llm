import type { Message } from '@latitude-data/compiler'

import { LogSources, Workspace } from '../../../browser'
import { addMessages as addMessagesProviderLog } from '../../providerLogs/addMessages'
import { ProviderLogsRepository } from '../../../repositories'
import { findPausedChain } from './findPausedChain'
import { resumeConversation } from './resumeConversation'
import { Result } from '../../../lib'

type CommonProps = {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
}

async function addMessagesToCompleteChain({
  workspace,
  documentLogUuid,
  messages,
  source,
}: CommonProps) {
  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)
  if (providerLogResult.error) return providerLogResult

  const providerLog = providerLogResult.value

  return addMessagesProviderLog({ workspace, providerLog, messages, source })
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

  const foundResult = await findPausedChain({ workspace, documentLogUuid })

  if (!foundResult) {
    // No chain cached found means normal chat behavior
    return addMessagesToCompleteChain({
      workspace,
      documentLogUuid,
      messages,
      source,
    })
  }

  if (foundResult.error) return foundResult

  const pausedChainData = foundResult.value

  return resumeConversation({
    workspace,
    commit: pausedChainData.commit,
    document: pausedChainData.document,
    pausedChain: pausedChainData.pausedChain,
    pausedChainMessages:
      pausedChainData.pausedChainMessages as unknown as Message[],
    documentLogUuid,
    responseMessages: messages,
    source,
  })
}
