import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { User } from '../schema/types'
import { databaseErrorCodes, UnprocessableEntityError } from '../lib/errors'
import { Result } from '../lib/Result'
import { memberships } from '../schema/models/memberships'
import { users } from '../schema/models/users'
import RepositoryLegacy from './repository'

const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}

export class UsersRepository extends RepositoryLegacy<typeof tt, User> {
  get scope() {
    return this.db
      .select(tt)
      .from(users)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, users.id),
          eq(memberships.workspaceId, this.workspaceId),
        ),
      )
      .as('usersScope')
  }

  async lock({ id, wait }: { id: string; wait?: boolean }) {
    // .for('no key update', { noWait: true }) is bugged in drizzle!
    // https://github.com/drizzle-team/drizzle-orm/issues/3554

    try {
      await this.db.execute(sql<boolean>`
        SELECT TRUE
        FROM ${users}
        INNER JOIN ${memberships} ON ${memberships.userId} = ${users.id}
        WHERE (
          ${memberships.workspaceId} = ${this.workspaceId} AND
          ${users.id} = ${id}
        ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(wait ? '' : 'NOWAIT')};
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
}
