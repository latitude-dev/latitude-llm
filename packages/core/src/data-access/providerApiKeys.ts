import { providerApiKeys } from '../schema/models/providerApiKeys'
import { eq } from 'drizzle-orm'

import { ProviderApiKey } from '../schema/types'
import { database } from '../client'

export function unsafelyFindProviderApiKey(
  providerId: number,
): Promise<ProviderApiKey | undefined> {
  return database.query.providerApiKeys.findFirst({
    where: eq(providerApiKeys.id, providerId),
  })
}
