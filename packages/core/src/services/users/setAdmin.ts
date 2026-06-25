import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
import { updateUser } from './update'

/**
 * Grants or revokes platform (backoffice) admin access for a user.
 *
 * Revoking is rejected when the target is the only remaining admin, so the
 * instance can never be left without an admin.
 */
export async function setUserAdmin(
  user: User,
  admin: boolean,
  transaction = new Transaction(),
) {
  if (user.admin === admin) return Result.ok(user)

  return transaction.call(async (tx) => {
    if (!admin) {
      const remainingAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.admin, true))
        .limit(2)

      if (remainingAdmins.length <= 1) {
        return Result.error(new BadRequestError('Cannot remove the last admin'))
      }
    }

    return updateUser(user, { admin }, transaction)
  })
}
