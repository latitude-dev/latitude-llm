import { eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
import { User } from '../../schema/models/types/User'

export async function markUserOnboardingComplete(
  {
    user,
  }: {
    user: User
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const updatedUsers = await tx
      .update(users)
      .set({
        onboardingCompletedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning()

    const updatedUser = updatedUsers[0]!

    return Result.ok(updatedUser)
  })
}

