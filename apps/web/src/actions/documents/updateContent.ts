'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'
import { DocumentVersionDto } from '@latitude-data/core/constants'

export const updateDocumentContentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      documentUuid: z.string(),
      commitUuid: z.string(),
      content: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
      })
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const document = await docsScope
      .getDocumentAtCommit({
        commitUuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
        documentUuid: parsedInput.documentUuid,
      })
      .then((r) => r.unwrap())

    const result = await updateDocument({
      commit,
      document,
      content: parsedInput.content,
    })
    const updatedDocument = result.unwrap()

    // This should never happen but it does happen sometimes
    if (!updatedDocument) {
      throw new BadRequestError(
        'Could not update document, if the issue persists please contact support.',
      )
    }

    return updatedDocument as DocumentVersionDto
  })
