import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { users } from '../../schema/models/users'
import { unscopedQuery } from '../scope'

export const unsafelyFindUserById = unscopedQuery(
  async function unsafelyFindUserById(
    { id }: { id: string },
    db,
  ): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
    return (rows[0] as User) ?? null
  },
)
