'use server'

import { deleteDocumentTrigger } from '@latitude-data/core/services/documentTriggers/delete'

import { withDocument } from '../../procedures'
import { z } from 'zod'
import { DocumentTriggersRepository } from '@latitude-data/core/repositories'

export const deleteDocumentTriggerAction = withDocument
  .createServerAction()
  .input(
    z.object({
      documentTriggerId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentTriggerId } = input

    const scope = new DocumentTriggersRepository(ctx.workspace.id)
    const trigger = await scope.find(documentTriggerId)

    if (trigger.error) throw trigger.error

    return deleteDocumentTrigger({
      workspace: ctx.workspace,
      documentTrigger: trigger.unwrap(),
    }).then((r) => r.unwrap())
  })
