import { SafeUser } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
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
  return Transaction.call<SafeUser>(async (trx) => {
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
}
