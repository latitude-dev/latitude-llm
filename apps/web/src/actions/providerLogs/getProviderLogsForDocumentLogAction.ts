'use server'

import { ProviderLogsRepository } from '@latitude-data/core'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const getProviderLogsForDocumentLogAction = authProcedure
  .createServerAction()
  .input(z.object({ documentLogId: z.number() }))
  .handler(async ({ input, ctx }) => {
    const providerLogsScope = new ProviderLogsRepository(ctx.workspace.id)

    return await providerLogsScope
      .findByDocumentLogId(input.documentLogId)
      .then((r) => r.unwrap())
  })
