import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
import { LatitudeGoal, UserTitle } from '@latitude-data/constants/users'

export async function createUser(
  {
    email,
    name,
    confirmedAt,
    title,
    admin = false,
    latitudeGoal,
    latitudeGoalOther,
  }: {
    email: string
    name: string
    confirmedAt?: Date
    title?: UserTitle
    admin?: boolean
    latitudeGoal?: LatitudeGoal
    latitudeGoalOther?: string
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
        title,
        admin,
        latitudeGoal,
        latitudeGoalOther,
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
