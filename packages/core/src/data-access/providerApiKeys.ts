import { providerApiKeys } from '../schema/models/providerApiKeys'
import { eq } from 'drizzle-orm'

import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { database } from '../client'
import { decryptProviderToken } from '../services/providerApiKeys/helpers/tokenEncryption'

export async function unsafelyFindProviderApiKey(
  providerId: number,
): Promise<ProviderApiKey | undefined> {
  const result = await database
    .select()
    .from(providerApiKeys)
    .where(eq(providerApiKeys.id, providerId))
    .limit(1)
    .then((rows) => rows[0])

  if (!result) return undefined

  return {
    ...result,
    token: decryptProviderToken(result.token),
  }
}
