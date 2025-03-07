'use server'

import { updateDocumentTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/update'

import { withDocument } from '../../procedures'
import { documentTriggerConfigurationsUnionSchema } from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { z } from 'zod'
import { DocumentTriggersRepository } from '@latitude-data/core/repositories'

export const updateDocumentTriggerConfigurationAction = withDocument
  .createServerAction()
  .input(
    z.object({
      documentTriggerId: z.number(),
      configuration: documentTriggerConfigurationsUnionSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentTriggerId, configuration } = input

    const scope = new DocumentTriggersRepository(ctx.workspace.id)
    const trigger = await scope.find(documentTriggerId)
    if (trigger.error) throw trigger.error

    return updateDocumentTriggerConfiguration({
      workspace: ctx.workspace,
      documentTrigger: trigger.unwrap(),
      configuration,
    }).then((r) => r.unwrap())
  })
