import { Database } from '$core/client'
import { hashPassword } from '$core/lib'
import { Result } from '$core/lib/Result'
import Transaction from '$core/lib/Transaction'
import { SafeUser, users } from '$core/schema'

export async function createUser({
  db,
  email,
  password,
  name,
}: {
  db: Database
  email: string
  password: string
  name: string
}) {
  const encryptedPassword = await hashPassword(password)
  return Transaction.call<SafeUser>(db, async (trx) => {
    const inserts = await trx
      .insert(users)
      .values({
        email,
        name,
        encryptedPassword,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      })
    const user = inserts[0]!
    return Result.ok(user)
  })
}
