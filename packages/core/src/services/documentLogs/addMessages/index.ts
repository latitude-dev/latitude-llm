import type { Message } from '@latitude-data/compiler'

import { LogSources, Workspace } from '../../../browser'
import { ProviderLogsRepository } from '../../../repositories'
import { addMessages as addMessagesProviderLog } from '../../providerLogs/addMessages'

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
  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)
  if (providerLogResult.error) return providerLogResult

  const providerLog = providerLogResult.value

  return addMessagesProviderLog({ workspace, providerLog, messages, source })
}
