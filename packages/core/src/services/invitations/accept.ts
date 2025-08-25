import type { Membership, User } from '../../browser'
import Transaction from '../../lib/Transaction'
import { updateMembership } from '../memberships'
import { updateUser } from '../users'

export async function acceptInvitation(
  {
    user,
    membership,
  }: {
    membership: Membership
    user: User
  },
  transaction = new Transaction(),
) {
  const date = new Date()
  if (!user.confirmedAt) {
    await updateUser(user, { confirmedAt: date }, transaction).then((r) => r.unwrap())
  }

  return await updateMembership(membership, { confirmedAt: date }, transaction)
}
