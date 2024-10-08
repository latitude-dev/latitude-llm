import { eq } from 'drizzle-orm'

import { MagicLinkToken } from '../browser'
import { database } from '../client'
import { magicLinkTokens } from '../schema'

export function unsafelyFindMagicLinkByToken(token: string) {
  return database.query.magicLinkTokens.findFirst({
    where: eq(magicLinkTokens.token, token),
  }) as Promise<MagicLinkToken | null>
}
