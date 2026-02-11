import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { users } from '../../schema/models/users'
import { unscopedQuery } from '../scope'

export const unsafelyFindUserByEmail = unscopedQuery(
  async function unsafelyFindUserByEmail(
    { email }: { email: string },
    db,
  ): Promise<User | null> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    return (rows[0] as User) ?? null
  },
)

export const unsafelyFindUserIdByEmail = unscopedQuery(
  async function unsafelyFindUserIdByEmail(
    { email }: { email: string },
    db,
  ): Promise<{ id: string; email: string } | undefined> {
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    return rows[0]
  },
)
