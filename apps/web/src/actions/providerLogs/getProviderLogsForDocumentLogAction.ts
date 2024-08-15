'use server'

import { ProviderLogsRepository } from '@latitude-data/core'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const getProviderLogsForDocumentLogAction = authProcedure
  .createServerAction()
  .input(z.object({ documentLogUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const providerLogsScope = new ProviderLogsRepository(ctx.workspace.id)

    return await providerLogsScope
      .findByDocumentLogUuid(input.documentLogUuid)
      .then((r) => r.unwrap())
  })
