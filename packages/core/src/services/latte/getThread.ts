import { LatteChange, ProviderLogDto, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { getLatteThreadChanges } from './getChanges'
import { getLatteThreadProviderLog } from './getProviderLog'

export async function getLatteThread(
  {
    workspace,
    threadUuid,
  }: {
    workspace: Workspace
    threadUuid: string
  },
  transaction = new Transaction(),
): PromisedResult<{
  changes: LatteChange[]
  providerLog: ProviderLogDto
}> {
  const changesResult = await getLatteThreadChanges(
    { workspace, threadUuid },
    transaction,
  )
  if (Result.isError(changesResult)) return changesResult

  const providerLogResult = await getLatteThreadProviderLog(
    { threadUuid },
    transaction,
  )
  if (Result.isError(providerLogResult)) return providerLogResult

  return Result.ok({
    changes: changesResult.unwrap(),
    providerLog: providerLogResult.unwrap(),
  })
}
