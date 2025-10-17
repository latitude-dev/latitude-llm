import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
export const updateUser = async (
  user: User,
  values: Partial<User>,
  transaction = new Transaction(),
) => {
  return transaction.call(async (tx) => {
    const updates = await tx
      .update(users)
      .set(values)
      .where(eq(users.id, user.id))
      .returning()

    return Result.ok(updates[0]!)
  })
}
