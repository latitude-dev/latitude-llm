'use server'

import { createDocumentTrigger } from '@latitude-data/core/services/documentTriggers/create'

import { withDocument } from '../../procedures'
import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { documentTriggerConfigurationsUnionSchema } from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { z } from 'zod'

export const createDocumentTriggerAction = withDocument
  .createServerAction()
  .input(
    z.object({
      triggerType: z.nativeEnum(DocumentTriggerType),
      configuration: documentTriggerConfigurationsUnionSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { triggerType, configuration } = input

    return createDocumentTrigger({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document as DocumentVersion,
      triggerType,
      configuration,
    }).then((r) => r.unwrap())
  })
