import { User } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { magicLinkTokens } from '../../schema/models/magicLinkTokens'

export async function createMagicLinkToken(
  { user, returnTo }: { user: User; returnTo?: string },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const magicLinkToken = await tx
      .insert(magicLinkTokens)
      .values({ userId: user.id })
      .returning()

    publisher.publishLater({
      type: 'magicLinkTokenCreated',
      data: {
        ...magicLinkToken[0]!,
        userEmail: user.email,
        returnTo,
      },
    })

    return Result.ok(magicLinkToken[0]!)
  }, db)
}
