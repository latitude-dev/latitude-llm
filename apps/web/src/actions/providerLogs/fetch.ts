'use server'

import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const getProviderLogsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string().optional(),
      documentLogUuid: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentUuid, documentLogUuid } = input
    const scope = new ProviderLogsRepository(ctx.workspace.id)

    let result
    if (documentLogUuid) {
      result = await scope
        .findByDocumentLogUuid(documentLogUuid, { limit: 1000 })
        .then((r) => r.unwrap())
    } else if (documentUuid) {
      result = await scope
        .findByDocumentUuid(documentUuid)
        .then((r) => r.unwrap())
    } else {
      result = await scope.findAll({ limit: 1000 }).then((r) => r.unwrap())
    }

    return result
  })
