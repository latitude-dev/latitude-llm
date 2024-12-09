import { asc, eq, getTableColumns } from 'drizzle-orm'

import { User, Workspace, WorkspaceDto } from '../browser'
import { database } from '../client'
import { memberships, users } from '../schema'

export type SessionData = {
  user: User
  workspace: WorkspaceDto
}

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

export async function unsafelyFindUserByEmail(email: string) {
  return database.query.users.findFirst({
    columns: {
      id: true,
      email: true,
    },
    where: eq(users.email, email),
  })
}
