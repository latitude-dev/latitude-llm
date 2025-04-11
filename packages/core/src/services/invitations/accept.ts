import { Membership, User } from '../../browser'
import { database } from '../../client'
import Transaction from './../../lib/Transaction'
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
      await updateUser(user, { confirmedAt: date }, tx).then((r) => r.unwrap())
    }

    return await updateMembership(membership, { confirmedAt: date }, tx)
  }, db)
}
