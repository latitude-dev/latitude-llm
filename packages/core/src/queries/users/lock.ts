import { sql } from 'drizzle-orm'

import { databaseErrorCodes, UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scopedQuery } from '../scope'

export const lockUser = scopedQuery(async function lockUser(
  {
    workspaceId,
    id,
    wait,
  }: { workspaceId: number; id: string; wait?: boolean },
  db,
): Promise<TypedResult<undefined>> {
  const shouldWait = wait !== false

  try {
    await db.execute(sql<boolean>`
      SELECT TRUE
      FROM ${users}
      INNER JOIN ${memberships} ON ${memberships.userId} = ${users.id}
      WHERE (
        ${memberships.workspaceId} = ${workspaceId} AND
        ${users.id} = ${id}
      ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(!shouldWait ? 'NOWAIT' : '')};
        `)
  } catch (error: any) {
    if (error?.code === databaseErrorCodes.lockNotAvailable) {
      return Result.error(
        new UnprocessableEntityError('Cannot obtain lock on user'),
      )
    }
    return Result.error(error as Error)
  }

  return Result.nil()
})
