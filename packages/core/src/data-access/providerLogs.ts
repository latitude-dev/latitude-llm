import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
import { providerLogs } from '../schema'
import { hydrateProviderLog } from '../services/providerLogs/hydrate'

export const findLastProviderLogFromDocumentLogUuid = async (
  documentLogUuid: string,
  db = database,
) => {
  const result = await db.query.providerLogs.findFirst({
    where: eq(providerLogs.documentLogUuid, documentLogUuid),
    orderBy: desc(providerLogs.generatedAt),
  })
  if (!result) return

  return hydrateProviderLog(result).then((r) => r.unwrap())
}

export const unsafelyFindProviderLogByUuid = async (
  providerLogUuid: string,
  db = database,
) => {
  const result = await db
    .select()
    .from(providerLogs)
    .where(eq(providerLogs.uuid, providerLogUuid))
    .limit(1)
  if (!result[0]) return

  return hydrateProviderLog(result[0]).then((r) => r.unwrap())
}
