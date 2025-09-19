import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { users } from '../../../schema'

export function findUser(id: string, db = database) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  })
}
