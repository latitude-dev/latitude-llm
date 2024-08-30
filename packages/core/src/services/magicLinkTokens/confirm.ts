import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { magicLinkTokens } from '../../schema'

export async function confirmMagicLinkToken(token: string, db = database) {
  return await Transaction.call(async (tx) => {
    const magicLinkToken = await tx
      .update(magicLinkTokens)
      .set({ expiredAt: new Date() })
      .where(eq(magicLinkTokens.token, token))
      .returning()

    return Result.ok(magicLinkToken[0]!)
  }, db)
}
