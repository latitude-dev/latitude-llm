import { eq } from 'drizzle-orm'
import { users } from '../../../schema/models/users'
import { database } from '../../../client'

export function findUser(id: string, db = database) {
  return db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((rows) => rows[0])
}
