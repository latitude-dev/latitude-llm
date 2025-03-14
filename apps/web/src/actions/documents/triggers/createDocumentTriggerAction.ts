'use server'

import { createDocumentTrigger } from '@latitude-data/core/services/documentTriggers/create'

import { withDocument } from '../../procedures'
import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { z } from 'zod'
import {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
} from '@latitude-data/core/services/documentTriggers/helpers/schema'

export const createDocumentTriggerAction = withDocument
  .createServerAction()
  .input(
    z.object({
      triggerType: z.nativeEnum(DocumentTriggerType),
      configuration: z.union(
        // @ts-ignore - TODO: fix this
        insertScheduledTriggerConfigurationSchema,
        emailTriggerConfigurationSchema,
      ),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { triggerType, configuration } = input

    return createDocumentTrigger({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document as DocumentVersion,
      triggerType: triggerType as DocumentTriggerType,
      configuration,
    }).then((r) => r.unwrap())
  })
