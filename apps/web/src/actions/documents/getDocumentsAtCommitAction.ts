'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const getDocumentsAtCommitAction = withProject
  .createServerAction()
  .input(z.object({ commitId: z.number() }))
  .handler(async ({ input, ctx }) => {
    const commit = await new CommitsRepository(ctx.project.workspaceId)
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const result = await docsScope.getDocumentsAtCommit(commit)

    return result.unwrap()
  })
