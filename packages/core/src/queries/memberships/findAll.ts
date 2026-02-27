import { eq } from 'drizzle-orm'

import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scopedQuery } from '../scope'
import { scopeFilter } from './filters'

export type MembershipWithUser = {
  id: number
  userId: string
  userName: string | null
  userEmail: string
}

export const findAllMemberships = scopedQuery(async function findAllMemberships(
  { workspaceId }: { workspaceId: number },
  db,
): Promise<MembershipWithUser[]> {
  const rows = await db
    .select({
      id: memberships.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(scopeFilter(workspaceId))

  return rows as MembershipWithUser[]
})
