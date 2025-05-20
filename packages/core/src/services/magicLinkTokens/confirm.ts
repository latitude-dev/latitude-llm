import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { magicLinkTokens } from '../../schema'
import { NotFoundError } from '../../lib/errors'

export async function confirmMagicLinkToken(token: string, db = database) {
  return await Transaction.call(async (tx) => {
    const magicLinkToken = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.token, token))
      .then((r) => r[0])
    if (!magicLinkToken) {
      throw new NotFoundError(`Could not find magic link with token ${token}`)
    }

    const updatedMagicLinkToken = await tx
      .update(magicLinkTokens)
      .set({ expiredAt: new Date() })
      .where(eq(magicLinkTokens.token, token))
      .returning()
      .then((r) => r[0])

    return Result.ok(updatedMagicLinkToken!)
  }, db)
}
