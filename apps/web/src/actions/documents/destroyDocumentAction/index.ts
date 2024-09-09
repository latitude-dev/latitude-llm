'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { destroyDocument } from '@latitude-data/core/services/documents/destroyDocument'
import { withProject } from '$/actions/procedures'
import { z } from 'zod'

export const destroyDocumentAction = withProject
  .createServerAction()
  .input(z.object({ documentUuid: z.string(), commitUuid: z.string() }), {
    type: 'json',
  })
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
    await destroyDocument({ document, commit }).then((r) => r.unwrap())

    return document
  })
