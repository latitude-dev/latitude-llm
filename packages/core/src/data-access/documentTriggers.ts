import { eq } from 'drizzle-orm'
import { database } from '../client'
import { documentTriggers } from '../schema'

export function unsafelyFindDocumentTrigger(uuid: string, db = database) {
  return db.query.documentTriggers.findFirst({
    where: eq(documentTriggers.uuid, uuid),
  })
}
