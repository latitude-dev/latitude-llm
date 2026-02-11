import { and, eq, getTableColumns } from 'drizzle-orm'

import { type User } from '../schema/models/types/User'
import { memberships } from '../schema/models/memberships'
import { users } from '../schema/models/users'
import { workspaceUsersScope } from '../queries/users/scope'
import { lockUser } from '../queries/users/lock'
import RepositoryLegacy from './repository'

const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}

/** @deprecated Use query functions from `queries/users/` instead */
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

  private get _scope() {
    return workspaceUsersScope(this.workspaceId, this.db)
  }

  async lock({ id, wait }: { id: string; wait?: boolean }) {
    return lockUser(this._scope, { id, wait })
  }
}
