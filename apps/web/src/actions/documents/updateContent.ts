'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
  updateDocument,
} from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const updateDocumentContentAction = withProject
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      commitId: z.number(),
      content: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const document = await docsScope
      .getDocumentByUuid({
        commit,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    const result = await updateDocument({
      commit,
      document,
      content: input.content,
    })

    return result.unwrap()
  })
