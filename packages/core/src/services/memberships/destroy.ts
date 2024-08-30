import { eq } from 'drizzle-orm'

import { Membership } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { memberships } from '../../schema'

export function destroyMembership(membership: Membership, db = database) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(memberships)
      .where(eq(memberships.id, membership.id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  }, db)
}
