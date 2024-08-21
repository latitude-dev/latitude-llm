import { SafeUser } from '$core/browser'
import { database } from '$core/client'
import { hashPassword, Result, Transaction } from '$core/lib'
import { users } from '$core/schema'

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
