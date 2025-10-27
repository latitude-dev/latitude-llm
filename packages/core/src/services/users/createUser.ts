import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
import { UserRole } from '@latitude-data/constants/users'

export async function createUser(
  {
    email,
    name,
    confirmedAt,
    role,
  }: {
    email: string
    name: string
    confirmedAt?: Date
    role?: UserRole
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
        role,
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
