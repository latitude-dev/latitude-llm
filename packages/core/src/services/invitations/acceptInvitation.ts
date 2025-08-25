import type { Membership, User } from '../../browser'
import { Result } from '../../lib/Result'
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

  const m = await updateMembership(
    membership,
    {
      confirmedAt: date,
    },
    transaction,
  ).then((r) => r.unwrap())

  return Result.ok(m)
}
