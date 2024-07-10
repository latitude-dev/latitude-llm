'use server'

import { createDocumentVersion, DocumentType } from '@latitude-data/core'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createDocumentVersionAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      documentType: z
        .enum([
          'folder' as DocumentType.Folder,
          'document' as DocumentType.Document,
        ])
        .optional(),
      name: z.string(),
      parentId: z.number().optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input }) => createDocumentVersion(input))
