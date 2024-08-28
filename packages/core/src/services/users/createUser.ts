import { SafeUser } from '../../browser'
import { database } from '../../client'
import { hashPassword, Result, Transaction } from '../../lib'
import { users } from '../../schema'

export async function createUser(
  {
    email,
    password,
    name,
  }: {
    email: string
    password: string
    name: string
  },
  db = database,
) {
  const encryptedPassword = await hashPassword(password)
  return Transaction.call<SafeUser>(async (trx) => {
    const inserts = await trx
      .insert(users)
      .values({
        email,
        name,
        encryptedPassword,
      })
      .returning()

    const user = inserts[0]!
    return Result.ok(user)
  }, db)
}
