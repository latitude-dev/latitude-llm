import { providerLogs } from '../schema/models/providerLogs'
import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
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
