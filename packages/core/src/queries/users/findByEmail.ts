import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { users } from '../../schema/models/users'
import { type UsersScope } from './scope'

export async function unsafelyFindUserByEmail(
  scope: UsersScope,
  email: string,
): Promise<User | null> {
  const rows = await scope.where(eq(users.email, email)).limit(1)
  return (rows[0] as User) ?? null
}

export async function unsafelyFindUserIdByEmail(
  scope: UsersScope,
  email: string,
): Promise<{ id: string; email: string } | undefined> {
  const rows = await scope.db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return rows[0]
}
