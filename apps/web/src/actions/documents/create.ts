'use server'

import { createDocumentVersion, DocumentType } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      commitUuid: z.string(),
      parentId: z.number().optional(),
      documentType: z.nativeEnum(DocumentType).optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input }) => {
    const result = await createDocumentVersion(input)
    return result.unwrap()
  })
