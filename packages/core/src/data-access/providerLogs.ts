import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
import { providerLogs } from '../schema'

export const findLastProviderLogFromDocumentLogUuid = async (
  documentLogUuid: string,
  db = database,
) => {
  return await db.query.providerLogs.findFirst({
    where: eq(providerLogs.documentLogUuid, documentLogUuid),
    orderBy: desc(providerLogs.generatedAt),
  })
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

  return result[0]
}
