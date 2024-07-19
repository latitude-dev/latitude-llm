'use server'

import { createNewDocument, findCommitByUuid } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      path: z.string(),
      commitUuid: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input }) => {
    const commitResult = await findCommitByUuid({
      projectId: input.projectId,
      uuid: input.commitUuid,
    })
    const commit = commitResult.unwrap()
    const result = await createNewDocument({
      commitId: commit.id,
      path: input.path,
    })
    return result.unwrap()
  })
