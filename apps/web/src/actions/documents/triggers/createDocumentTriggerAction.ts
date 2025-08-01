'use server'

import { createDocumentTrigger } from '@latitude-data/core/services/documentTriggers/create'

import { withDocument } from '../../procedures'
import { DocumentTriggerType } from '@latitude-data/constants'
import { z } from 'zod'
import {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
  integrationTriggerConfigurationSchema,
  InsertDocumentTriggerWithConfiguration,
} from '@latitude-data/constants/documentTriggers'

export const createDocumentTriggerAction = withDocument
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      trigger: z.object({
        type: z.any(),
        configuration: z.union([
          insertScheduledTriggerConfigurationSchema,
          emailTriggerConfigurationSchema,
          integrationTriggerConfigurationSchema.omit({ triggerId: true }),
        ]),
      }),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { trigger } = input

    return createDocumentTrigger({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document,
      trigger: {
        type: trigger.type as DocumentTriggerType,
        configuration: trigger.configuration,
      } as InsertDocumentTriggerWithConfiguration,
    }).then((r) => r.unwrap())
  })
