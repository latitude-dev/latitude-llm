'use server'

import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { updateApiKey } from '@latitude-data/core/services/apiKeys/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.coerce.number(), name: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKeysRepo = new ApiKeysRepository(ctx.workspace.id)
    const apiKey = await apiKeysRepo
      .find(parsedInput.id)
      .then((r) => r.unwrap())

    return updateApiKey(apiKey, { name: parsedInput.name }).then((r) =>
      r.unwrap(),
    )
  })
