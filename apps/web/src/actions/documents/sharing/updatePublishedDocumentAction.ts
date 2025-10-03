'use server'

import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'
import { updatePublishedDocument } from '@latitude-data/core/services/publishedDocuments/update'
import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../../procedures'

const input = z.object({
  uuid: z.string(),
  isPublished: z.boolean().optional(),
  canFollowConversation: z.boolean().optional(),
  displayPromptOnly: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
})
export type UpdatePublishedDocumentInput = z.infer<typeof input>

export const updatePublishedDocumentAction = withDocument
  .inputSchema(withDocumentSchema.extend(input.shape))
  .action(async ({ ctx, parsedInput }) => {
    const repo = new PublishedDocumentRepository(ctx.workspace.id)
    const publishedDocument = await repo
      .findByUuid(parsedInput.uuid)
      .then((r) => r.unwrap())
    return updatePublishedDocument({
      publishedDocument,
      data: input,
    }).then((r) => r.unwrap())
  })
