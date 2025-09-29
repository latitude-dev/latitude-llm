'use server'

import { withProject, withProjectSchema } from '$/actions/procedures'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { destroyDocument } from '@latitude-data/core/services/documents/destroyDocument'
import { z } from 'zod'

export const destroyDocumentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      documentUuid: z.string(),
      commitUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
      })
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await docsScope
      .getDocumentAtCommit({
        commitUuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
        documentUuid: parsedInput.documentUuid,
      })
      .then((r) => r.unwrap())
    await destroyDocument({
      document,
      commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return document
  })
