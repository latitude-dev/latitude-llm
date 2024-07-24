'use server'

import { updateDocument } from '@latitude-data/core'
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
  .handler(async ({ input }) => {
    const result = await updateDocument({
      commitId: input.commitId,
      documentUuid: input.documentUuid,
      content: input.content,
    })
    return result.unwrap()
  })
