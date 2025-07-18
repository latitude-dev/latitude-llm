import { eq } from 'drizzle-orm'

import { Membership } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema'

export function destroyMembership(
  membership: Membership,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .delete(memberships)
      .where(eq(memberships.id, membership.id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  })
}
