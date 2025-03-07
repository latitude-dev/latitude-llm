import { and, eq } from 'drizzle-orm'
import { database } from '../../client'
import { documentTriggers } from '../../schema'
import { DocumentTrigger } from '../../browser'
import { DocumentTriggerType } from '@latitude-data/constants'

/**
 * Warning: This is not scoped by a workspace. Must only be used by services that are not scoped by workspace.
 */
export async function findUnscopedDocumentTriggers(
  {
    documentUuid,
    triggerType,
  }: {
    documentUuid: string
    triggerType: DocumentTriggerType
  },
  db = database,
): Promise<DocumentTrigger[]> {
  return db
    .select()
    .from(documentTriggers)
    .where(
      and(
        eq(documentTriggers.documentUuid, documentUuid),
        eq(documentTriggers.triggerType, triggerType),
      ),
    )
    .execute() as Promise<DocumentTrigger[]>
}
