'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'

import { withProject } from '../procedures'

export const updateDocumentContentAction = withProject
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      commitUuid: z.string(),
      content: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({ uuid: input.commitUuid, projectId: ctx.project.id })
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const document = await docsScope
      .getDocumentAtCommit({
        commitUuid: input.commitUuid,
        projectId: ctx.project.id,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    const result = await updateDocument({
      commit,
      document,
      content: input.content,
    })
    const updatedDocument = result.unwrap()

    // This should never happen but it does happen sometimes
    if (!updatedDocument) {
      throw new BadRequestError(
        'Could not update document, if the issue persists please contact support.',
      )
    }

    return updatedDocument
  })
