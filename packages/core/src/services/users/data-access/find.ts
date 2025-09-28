import { eq } from 'drizzle-orm'
import { users } from '../../../schema/models/users'
import { database } from '../../../client'

export function findUser(id: string, db = database) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  })
}
