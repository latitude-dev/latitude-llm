import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { type User } from '../schema/models/types/User'
import { type Membership } from '../schema/models/types/Membership'
import { WorkspaceRole } from '../permissions/workspace'
import { databaseErrorCodes, UnprocessableEntityError } from '../lib/errors'
import { Result } from '../lib/Result'
import { memberships } from '../schema/models/memberships'
import { users } from '../schema/models/users'
import RepositoryLegacy from './repository'

export type WorkspaceUser = User & {
  membershipId: number
  role: WorkspaceRole
  confirmedAt: Membership['confirmedAt']
}

const tt = {
  ...getTableColumns(users),
  membershipId: memberships.id,
  role: memberships.role,
  confirmedAt: memberships.confirmedAt,
}

export class UsersRepository extends RepositoryLegacy<
  typeof tt,
  WorkspaceUser
> {
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
    // Default to waiting for locks to handle concurrent job processing.
    // Set wait: false explicitly if NOWAIT behavior is needed.
    const shouldWait = wait !== false

    try {
      await this.db.execute(sql<boolean>`
        SELECT TRUE
        FROM ${users}
        INNER JOIN ${memberships} ON ${memberships.userId} = ${users.id}
        WHERE (
          ${memberships.workspaceId} = ${this.workspaceId} AND
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
}
