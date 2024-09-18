import { eq } from 'drizzle-orm'

import { User, Workspace } from '../browser'
import { database } from '../client'
import { users } from '../schema'

export type SessionData = {
  user: User
  workspace: Workspace
}

export function unsafelyGetUser(id?: string) {
  return database.query.users.findFirst({
    where: eq(users.id, id ?? ''),
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
