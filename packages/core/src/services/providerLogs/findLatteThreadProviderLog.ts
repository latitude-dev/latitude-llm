import { ProviderLogDto } from '../../schema/types'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access/providerLogs'
import { buildProviderLogResponse } from './buildResponse'

export async function findLatteThreadProviderLog({
  lastThreadUuid,
}: {
  lastThreadUuid: string | undefined
}): Promise<ProviderLogDto | undefined> {
  if (!lastThreadUuid) return undefined

  const res = await findLastProviderLogFromDocumentLogUuid(lastThreadUuid)
  if (!res) return undefined

  return { ...res, response: buildProviderLogResponse(res) }
}
