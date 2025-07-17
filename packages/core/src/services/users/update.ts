import { eq } from 'drizzle-orm'

import { User } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema'
export const updateUser = async (
  user: User,
  values: Partial<User>,
  db = database,
) => {
  return Transaction.call(async (tx) => {
    const updates = await tx
      .update(users)
      .set(values)
      .where(eq(users.id, user.id))
      .returning()

    return Result.ok(updates[0]!)
  }, db)
}
