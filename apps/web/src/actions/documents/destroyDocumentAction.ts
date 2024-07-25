'use server'

import {
  CommitsRepository,
  destroyDocument,
  DocumentVersionsRepository,
} from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

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
      .getDocumentByUuid({
        commit,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())
    const result = await destroyDocument({
      document,
      commit,
      workspaceId: ctx.project.workspaceId,
    })
    return result.unwrap()
  })
