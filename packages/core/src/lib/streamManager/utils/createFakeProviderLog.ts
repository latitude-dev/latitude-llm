import { VercelConfig } from '@latitude-data/constants'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '../../../constants'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { fakeResponse } from '../../../services/chains/ProviderProcessor'
import { buildProviderLogDto } from '../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { createProviderLog } from '../../../services/providerLogs/create'

/**
 * When a assistant message is stopped by the user, we must create a uncomplete provider log with the information we
 * have to keep the message chain alive
 **/
export async function createFakeProviderLog({
  documentLogUuid,
  accumulatedText,
  workspace,
  source,
  provider,
  config,
  messages,
  startTime,
}: {
  documentLogUuid: string
  accumulatedText: { text: string }
  workspace: Workspace
  source: LogSources
  provider: ProviderApiKey
  config: VercelConfig
  messages: LegacyMessage[]
  startTime: number
}) {
  const response = await fakeResponse({
    documentLogUuid,
    accumulatedText,
  })
  await createProviderLog({
    workspace,
    ...buildProviderLogDto({
      workspace,
      source,
      provider,
      conversation: {
        messages,
        config,
      },
      stepStartTime: startTime,
      errorableUuid: documentLogUuid,
      response: response,
    }),
  }).then((r) => r.unwrap())
}
