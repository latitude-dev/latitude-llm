import { memberships } from '../schema/models/memberships'
import { users } from '../schema/models/users'
import { asc, eq, getTableColumns } from 'drizzle-orm'

import { User, Workspace, WorkspaceDto } from '../schema/types'
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
  return database.query.users.findFirst({
    where: eq(users.id, id ?? ''),
  }) as Promise<User | null>
}

export function unsafelyGetUserByEmail(email?: string) {
  return database.query.users.findFirst({
    where: eq(users.email, email ?? ''),
  }) as Promise<User | null>
}

export async function unsafelyFindUserByEmail(email: string, db = database) {
  return db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
    },
    where: eq(users.email, email),
  })
}
