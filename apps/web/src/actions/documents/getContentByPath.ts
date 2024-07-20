'use server'

import { CommitsRepository } from '@latitude-data/core'
import { getDocumentByPath } from '$/app/(private)/_data-access'
import { z } from 'zod'

import { withProject } from '../procedures'

export const getDocumentContentByPathAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitId: z.number(),
      path: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())
    const document = await getDocumentByPath({
      commit,
      path: input.path,
    })
    return document.content
  })
