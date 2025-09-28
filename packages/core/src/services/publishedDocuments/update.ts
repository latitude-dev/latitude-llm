import { eq } from 'drizzle-orm'

import { PublishedDocument } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { publishedDocuments } from '../../schema/models/publishedDocuments'
type UpdatablePublishedDocument = Pick<
  PublishedDocument,
  | 'isPublished'
  | 'canFollowConversation'
  | 'title'
  | 'description'
  | 'displayPromptOnly'
>
export async function updatePublishedDocument(
  {
    publishedDocument,
    data,
  }: {
    publishedDocument: PublishedDocument
    data: Partial<UpdatablePublishedDocument>
  },
  transaction = new Transaction(),
) {
  return await transaction.call<PublishedDocument>(async (trx) => {
    const inserts = await trx
      .update(publishedDocuments)
      .set(data)
      .where(eq(publishedDocuments.uuid, publishedDocument.uuid!))
      .returning()

    return Result.ok(inserts[0]!)
  })
}
