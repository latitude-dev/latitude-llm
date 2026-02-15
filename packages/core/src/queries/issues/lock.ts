import { sql } from 'drizzle-orm'

import { databaseErrorCodes, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { issues } from '../../schema/models/issues'
import { scopedQuery } from '../scope'

export const lockIssue = scopedQuery(async function lockIssue(
  {
    workspaceId,
    id,
    wait,
  }: {
    workspaceId: number
    id: number
    wait?: boolean
  },
  db,
) {
  const shouldWait = wait !== false

  try {
    await db.execute(sql<boolean>`
      SELECT TRUE
      FROM ${issues}
      WHERE (
        ${issues.workspaceId} = ${workspaceId} AND
        ${issues.id} = ${id}
      ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(!shouldWait ? 'NOWAIT' : '')};
        `)
  } catch (err) {
    const error = err as Error

    if (
      'code' in error &&
      error.code === databaseErrorCodes.lockNotAvailable
    ) {
      return Result.error(
        new UnprocessableEntityError('Cannot obtain lock on issue'),
      )
    }
    return Result.error(error)
  }

  return Result.nil()
})
