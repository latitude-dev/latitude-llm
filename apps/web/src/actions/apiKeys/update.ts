'use server'

import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { updateApiKey } from '@latitude-data/core/services/apiKeys/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.coerce.number(),
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const apiKeysRepo = new ApiKeysRepository(ctx.workspace.id)
    const apiKey = await apiKeysRepo.find(input.id).then((r) => r.unwrap())

    return updateApiKey(apiKey, { name: input.name }).then((r) => r.unwrap())
  })
