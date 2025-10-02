import { providerLogs } from '../schema/models/providerLogs'
import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
import { hydrateProviderLog } from '../services/providerLogs/hydrate'

export const findLastProviderLogFromDocumentLogUuid = async (
  documentLogUuid: string,
  db = database,
) => {
  const result = await db
    .select()
    .from(providerLogs)
    .where(eq(providerLogs.documentLogUuid, documentLogUuid))
    .orderBy(desc(providerLogs.generatedAt))
    .limit(1)
    .then((rows) => rows[0])
  if (!result) return

  return hydrateProviderLog(result).then((r) => r.unwrap())
}
