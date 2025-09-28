import { documentTriggers } from '../schema/models/documentTriggers'
import { eq } from 'drizzle-orm'
import { database } from '../client'

export function unsafelyFindDocumentTrigger(uuid: string, db = database) {
  return db.query.documentTriggers.findFirst({
    where: eq(documentTriggers.uuid, uuid),
  })
}
