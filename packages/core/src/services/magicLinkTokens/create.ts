import type { User } from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { magicLinkTokens } from '../../schema/models/magicLinkTokens'

export async function createMagicLinkToken(
  { user, returnTo }: { user: User; returnTo?: string },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const magicLinkToken = await tx.insert(magicLinkTokens).values({ userId: user.id }).returning()

    publisher.publishLater({
      type: 'magicLinkTokenCreated',
      data: {
        ...magicLinkToken[0]!,
        userEmail: user.email,
        returnTo,
      },
    })

    return Result.ok(magicLinkToken[0]!)
  })
}
