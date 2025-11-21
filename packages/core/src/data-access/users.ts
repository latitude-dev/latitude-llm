import { memberships } from '../schema/models/memberships'
import { users } from '../schema/models/users'
import { asc, eq, getTableColumns } from 'drizzle-orm'

import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import { WorkspaceDto } from '../schema/models/types/Workspace'
import { database } from '../client'

export async function findFirstUserInWorkspace(
  workspace: WorkspaceDto | Workspace,
) {
  const results = await database
    .select(getTableColumns(users))
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspace.id))
    .orderBy(asc(users.createdAt))
    .limit(1)

  return results[0]
}

export function unsafelyGetUser(id?: string) {
  return database
    .select()
    .from(users)
    .where(eq(users.id, id ?? ''))
    .limit(1)
    .then((rows) => rows[0] || null) as Promise<User | null>
}

export function unsafelyGetUserByEmail(email?: string) {
  return database
    .select()
    .from(users)
    .where(eq(users.email, email ?? ''))
    .limit(1)
    .then((rows) => rows[0] || null) as Promise<User | null>
}

export async function unsafelyFindUserByEmail(email: string, db = database) {
  return db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .then((rows) => rows[0])
}
