import { type User } from '../../schema/models/types/User'
import { eq } from 'drizzle-orm'

import { Result, TypedResult } from '../../lib/Result'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllWorkspaceUsers = scopedQuery(
  async function findAllWorkspaceUsers(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<TypedResult<User[]>> {
    const result = await db
      .select(tt)
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(tenancyFilter(workspaceId))
    return Result.ok(result as User[])
  },
)
