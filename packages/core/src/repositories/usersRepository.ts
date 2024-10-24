import { and, eq, getTableColumns } from 'drizzle-orm'

import { User } from '../browser'
import { memberships, users } from '../schema'
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
}
