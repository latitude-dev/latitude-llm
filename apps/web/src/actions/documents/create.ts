'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { z } from 'zod'
import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .inputSchema(
    z.object({
      commitUuid: z.string(),
      path: z.string(),
      agent: z.boolean().optional().default(false),
      content: z.string().optional(),
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

    const result = await createNewDocument({
      workspace: ctx.workspace,
      user: ctx.user,
      commit,
      path: parsedInput.path,
      content: parsedInput.content,
      agent: parsedInput.agent,
      createDemoEvaluation: true,
    })

    return result.unwrap()
  })
