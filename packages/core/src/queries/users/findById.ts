import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { users } from '../../schema/models/users'
import { type UsersScope } from './scope'

export async function unsafelyFindUserById(
  scope: UsersScope,
  id: string,
): Promise<User | null> {
  const rows = await scope.where(eq(users.id, id)).limit(1)
  return (rows[0] as User) ?? null
}
