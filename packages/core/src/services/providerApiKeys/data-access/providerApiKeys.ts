import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { providerApiKeys } from '../../../schema/models/providerApiKeys'
import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { serializeProviderApiKey } from '../helpers/serializeProviderApiKey'

export async function unsafelyFindProviderApiKey(
  providerId: number,
  db = database,
): Promise<ProviderApiKey | undefined> {
  const result = await db
    .select()
    .from(providerApiKeys)
    .where(eq(providerApiKeys.id, providerId))
    .limit(1)
    .then((rows) => rows[0])

  if (!result) return undefined

  return serializeProviderApiKey(result)
}
