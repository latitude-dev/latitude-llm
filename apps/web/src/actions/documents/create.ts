'use server'

import { createDocumentVersion } from '@latitude-data/core'
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
    const result = await createDocumentVersion(input)
    return result.unwrap()
  })
