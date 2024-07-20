import { database } from '$core/client'
import { LatitudeError, NotFoundError, Result, TypedResult } from '$core/lib'
import { documentVersions } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function getDocumentById(
  {
    documentId,
  }: {
    documentId: number
  },
  db = database,
): Promise<TypedResult<{ content: string }, LatitudeError>> {
  const document = await db.query.documentVersions.findFirst({
    where: eq(documentVersions.id, documentId),
  })
  if (!document) return Result.error(new NotFoundError('Document not found'))

  return Result.ok(document)
}
