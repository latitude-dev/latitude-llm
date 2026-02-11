import { eq, getTableColumns } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'
import { scope, unsafeScope } from '../scope'

const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}

export const workspaceUsersScope = scope<User>({
  from: (db) =>
    db
      .select(tt)
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .$dynamic(),
  tenancyFilter: (workspaceId) => eq(memberships.workspaceId, workspaceId),
})

export type WorkspaceUsersScope = ReturnType<typeof workspaceUsersScope>

const unsafeTt = getTableColumns(users)

export const usersScope = unsafeScope<User>({
  from: (db) => db.select(unsafeTt).from(users).$dynamic(),
})

export type UsersScope = ReturnType<typeof usersScope>
