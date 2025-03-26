'use server'

import { createDocumentTrigger } from '@latitude-data/core/services'

import { withDocument } from '../../procedures'
import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { z } from 'zod'
import {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
} from '@latitude-data/core/services'

export const createDocumentTriggerAction = withDocument
  .createServerAction()
  .input(
    z.object({
      triggerType: z.any(),
      configuration: z.union([
        insertScheduledTriggerConfigurationSchema,
        emailTriggerConfigurationSchema,
      ]),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { triggerType, configuration } = input

    // @ts-expect-error - TS cannot reconcile configuration union type
    return createDocumentTrigger({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document as DocumentVersion,
      triggerType: triggerType as DocumentTriggerType,
      configuration: configuration,
    }).then((r) => r.unwrap())
  })
