'use server'

import {
  CommitsRepository,
  destroyDocument,
  DocumentVersionsRepository,
} from '@latitude-data/core'
import { withProject } from '$/actions/procedures'
import { z } from 'zod'

export const destroyDocumentAction = withProject
  .createServerAction()
  .input(z.object({ documentUuid: z.string(), commitId: z.number() }), {
    type: 'json',
  })
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const document = await docsScope
      .getDocumentAtCommit({
        commit,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())
    await destroyDocument({ document, commit }).then((r) => r.unwrap())

    return document
  })
