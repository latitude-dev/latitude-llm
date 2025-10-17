import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'

export async function createUser(
  {
    email,
    name,
    confirmedAt,
  }: {
    email: string
    name: string
    confirmedAt?: Date
  },
  transaction = new Transaction(),
) {
  const result = await transaction.call<User>(async (trx) => {
    const inserts = await trx
      .insert(users)
      .values({
        email,
        name,
        confirmedAt,
      })
      .returning()

    const user = inserts[0]!

    return Result.ok(user)
  })

  if (result.ok) {
    publisher.publishLater({
      type: 'claimReferralInvitations',
      data: {
        newUser: result.unwrap(),
      },
    })
  }

  return result
}
