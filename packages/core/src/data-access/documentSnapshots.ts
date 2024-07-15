import {
  database,
  documentSnapshots,
  documentVersions,
} from '@latitude-data/core'
import { eq } from 'drizzle-orm'

export async function listdocumentSnapshots() {
  const documents = await database
    .select()
    .from(documentSnapshots)
    .innerJoin(
      documentVersions,
      eq(documentSnapshots.documentVersionId, documentVersions.id),
    )

  return documents
}
