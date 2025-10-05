'use server'

import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { destroyApiKey } from '@latitude-data/core/services/apiKeys/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKeysRepo = new ApiKeysRepository(ctx.workspace.id)
    const apiKey = await apiKeysRepo
      .find(parsedInput.id)
      .then((r) => r.unwrap())

    return destroyApiKey(apiKey).then((r) => r.unwrap())
  })
