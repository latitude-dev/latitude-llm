'use server'

import { withDocument } from '$/actions/procedures'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'
import { createPublishedDocument } from '@latitude-data/core/services/publishedDocuments/create'
import { updatePublishedDocument } from '@latitude-data/core/services/publishedDocuments/update'

export const publishDocumentAction = withDocument.createServerAction().handler(async ({ ctx }) => {
  const scope = new PublishedDocumentRepository(ctx.workspace.id)
  const rows = await scope.findByProject(Number(ctx.project.id))
  const publishedDocument = rows.find((d) => d.documentUuid === ctx.document.documentUuid)

  if (publishedDocument) {
    return updatePublishedDocument({
      publishedDocument,
      data: { isPublished: true },
    }).then((r) => r.unwrap())
  } else {
    return createPublishedDocument({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document,
      commitUuid: ctx.currentCommitUuid,
      isPublished: true,
    }).then((r) => r.unwrap())
  }
})
