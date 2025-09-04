import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { ProviderLogDto } from '@latitude-data/core/browser'
import Transaction from '../../lib/Transaction'
import { getCopilotDocument } from '../copilot/latte/helpers'
import { ProviderLogsRepository } from '../../repositories'
import serializeProviderLog from '../providerLogs/serialize'

export async function getLatteThreadProviderLog(
  {
    threadUuid,
  }: {
    threadUuid: string
  },
  transaction = new Transaction(),
): Promise<TypedResult<ProviderLogDto>> {
  const latteResult = await getCopilotDocument()
  if (Result.isError(latteResult)) return latteResult
  const { workspace: latteWorkspace } = latteResult.unwrap()

  return transaction.call(async (tx) => {
    const providerLogsScope = new ProviderLogsRepository(latteWorkspace.id, tx)
    const providerLogResult =
      await providerLogsScope.findLastByDocumentLogUuid(threadUuid)
    if (Result.isError(providerLogResult)) return providerLogResult

    const hydratedProviderLog = providerLogResult.unwrap()
    const serializedProviderLog = serializeProviderLog(hydratedProviderLog)

    return Result.ok(serializedProviderLog)
  })
}
