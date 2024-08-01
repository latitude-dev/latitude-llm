import { database, users } from '@latitude-data/core'
import { type SafeUser } from '$core/browser'
import { eq } from 'drizzle-orm'

export type SessionData = {
  user: SafeUser
  workspace: { id: number; name: string }
}

export function unsafelyGetUser(id?: string) {
  return database.query.users.findFirst({
    where: eq(users.id, id ?? ''),
  })
}
