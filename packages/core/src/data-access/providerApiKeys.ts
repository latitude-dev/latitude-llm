import { eq } from 'drizzle-orm'

import type { ProviderApiKey } from '../browser'
import { database } from '../client'
import { providerApiKeys } from '../schema'

export function unsafelyFindProviderApiKey(
  providerId: number,
): Promise<ProviderApiKey | undefined> {
  return database.query.providerApiKeys.findFirst({
    where: eq(providerApiKeys.id, providerId),
  })
}
