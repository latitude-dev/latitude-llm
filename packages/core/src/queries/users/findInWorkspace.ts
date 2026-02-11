import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { type User } from '../../schema/models/types/User'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findWorkspaceUserById = scopedQuery(
  async function findWorkspaceUserById(
    { workspaceId, id }: { workspaceId: number; id: string },
    db,
  ): Promise<TypedResult<User>> {
    const rows = await db
      .select(tt)
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(tenancyFilter(workspaceId), eq(users.id, id)))
      .limit(1)
    const row = rows[0] as User | undefined
    if (!row) {
      return Result.error(new NotFoundError(`Record with id ${id} not found`))
    }
    return Result.ok(row)
  },
)
