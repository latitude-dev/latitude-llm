import { ProviderLogDto } from '../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access'
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
