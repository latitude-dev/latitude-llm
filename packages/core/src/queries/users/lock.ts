import { sql } from 'drizzle-orm'

import { databaseErrorCodes, UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { type WorkspaceUsersScope } from './scope'

export async function lockUser(
  scope: WorkspaceUsersScope,
  { id, wait }: { id: string; wait?: boolean },
): Promise<TypedResult<undefined>> {
  const shouldWait = wait !== false

  try {
    await scope.db.execute(sql<boolean>`
      SELECT TRUE
      FROM ${users}
      INNER JOIN ${memberships} ON ${memberships.userId} = ${users.id}
      WHERE (
        ${memberships.workspaceId} = ${scope.workspaceId} AND
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
}
