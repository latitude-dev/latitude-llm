import { eq } from 'drizzle-orm'

import { type SafeUser } from '../browser'
import { database } from '../client'
import { users } from '../schema'

export type SessionData = {
  user: SafeUser
  workspace: { id: number; name: string }
}

export function unsafelyGetUser(id?: string) {
  return database.query.users.findFirst({
    where: eq(users.id, id ?? ''),
  })
}
