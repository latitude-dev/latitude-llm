import { documentTriggers } from '../schema/models/documentTriggers'
import { eq } from 'drizzle-orm'
import { database } from '../client'

export function unsafelyFindDocumentTrigger(uuid: string, db = database) {
  return db
    .select()
    .from(documentTriggers)
    .where(eq(documentTriggers.uuid, uuid))
    .limit(1)
    .then((rows) => rows[0])
}
