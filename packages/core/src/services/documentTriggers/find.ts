import { and, eq } from 'drizzle-orm'
import { database } from '../../client'
import { documentTriggers } from '../../schema'
import type { DocumentTrigger } from '../../browser'
import type { DocumentTriggerType } from '@latitude-data/constants'

/**
 * Find document triggers by type without workspace scoping
 */
export async function findUnscopedDocumentTriggers(
  {
    documentUuid,
    triggerType,
  }: {
    documentUuid?: string
    triggerType?: DocumentTriggerType
  },
  db = database,
): Promise<DocumentTrigger[]> {
  const conditions = []

  if (documentUuid) {
    conditions.push(eq(documentTriggers.documentUuid, documentUuid))
  }

  if (triggerType) {
    conditions.push(eq(documentTriggers.triggerType, triggerType))
  }

  const whereClause = conditions.length ? and(...conditions) : undefined

  const result = await db.select().from(documentTriggers).where(whereClause)

  return result as DocumentTrigger[]
}
