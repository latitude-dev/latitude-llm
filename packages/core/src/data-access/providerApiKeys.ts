import { providerApiKeys } from '../schema/models/providerApiKeys'
import { eq } from 'drizzle-orm'

import { ProviderApiKey } from '../schema/types'
import { database } from '../client'

export function unsafelyFindProviderApiKey(
  providerId: number,
): Promise<ProviderApiKey | undefined> {
  return database
    .select()
    .from(providerApiKeys)
    .where(eq(providerApiKeys.id, providerId))
    .limit(1)
    .then((rows) => rows[0])
}
