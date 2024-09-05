import { eq } from 'drizzle-orm'

import { SafeUser, SafeWorkspace, User } from '../browser'
import { database } from '../client'
import { users } from '../schema'

export type SessionData = {
  user: SafeUser
  workspace: SafeWorkspace
}

export function unsafelyGetUser(id?: string) {
  return database.query.users.findFirst({
    where: eq(users.id, id ?? ''),
  }) as Promise<User | null>
}
