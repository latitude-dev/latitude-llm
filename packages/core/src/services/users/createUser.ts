import { User } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { users } from '../../schema'

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
  db = database,
) {
  const result = await Transaction.call<User>(async (trx) => {
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
  }, db)

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
