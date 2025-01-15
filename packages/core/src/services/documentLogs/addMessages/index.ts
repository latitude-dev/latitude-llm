import { Message } from '@latitude-data/compiler'

import { LogSources, Workspace } from '../../../browser'
import { addMessages as addMessagesProviderLog } from '../../providerLogs/addMessages'
import { ProviderLogsRepository } from '../../../repositories'
import { findPausedChain } from './findPausedChain'

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
  const pausedChainData = await findPausedChain({ workspace, documentLogUuid })

  if (!pausedChainData) {
    return addMessagesToCompleteChain({
      workspace,
      documentLogUuid,
      messages,
      source,
    })
  }
}
