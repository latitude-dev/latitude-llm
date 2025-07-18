import { eq } from 'drizzle-orm'

import { Membership } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema'
export const updateMembership = async (
  membership: Membership,
  values: Partial<Membership>,
  transaction = new Transaction(),
) => {
  return transaction.call(async (tx) => {
    const updates = await tx
      .update(memberships)
      .set(values)
      .where(eq(memberships.id, membership.id))
      .returning()

    return Result.ok(updates[0]!)
  })
}
