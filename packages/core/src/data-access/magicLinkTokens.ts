import { eq } from 'drizzle-orm'

import { database } from '../client'
import { magicLinkTokens } from '../schema'

export function unsafelyFindMagicLinkByToken(token: string, db = database) {
  return db.select().from(magicLinkTokens).where(eq(magicLinkTokens.token, token)).limit(1)
}
