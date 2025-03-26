'use server'

import { ApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyApiKey } from '@latitude-data/core/services'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const apiKeysRepo = new ApiKeysRepository(ctx.workspace.id)
    const apiKey = await apiKeysRepo.find(input.id).then((r) => r.unwrap())

    return destroyApiKey(apiKey).then((r) => r.unwrap())
  })
