import { Membership, User } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { updateMembership } from '../memberships'
import { updateUser } from '../users'

export function acceptInvitation(
  {
    user,
    membership,
  }: {
    membership: Membership
    user: User
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const date = new Date()
    if (!user.confirmedAt) {
      await updateUser(user, { confirmedAt: date }).then((r) => r.unwrap())
    }

    const m = await updateMembership(
      membership,
      {
        confirmedAt: date,
      },
      tx,
    ).then((r) => r.unwrap())

    return Result.ok(m)
  }, db)
}
