'use server'

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
  .handler(async ({ input }) => {
    const document = await getDocumentByPath({
      commitId: input.commitId,
      path: input.path,
    })
    return document.content
  })
