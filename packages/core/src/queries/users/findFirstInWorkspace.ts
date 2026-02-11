import { asc, eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'
import { database } from '../../client'

export const findFirstUserInWorkspace = scopedQuery(
  async function findFirstUserInWorkspace(
    { workspaceId }: { workspaceId: number },
    db = database,
  ) {
    const results = await db
      .select(tt)
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(tenancyFilter(workspaceId))
      .orderBy(asc(users.createdAt))
      .limit(1)
    return results[0] as User
  },
)
