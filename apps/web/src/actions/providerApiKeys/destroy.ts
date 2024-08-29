'use server'

import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyProviderApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const providerApiKeysRepository = new ProviderApiKeysRepository(
      ctx.workspace.id,
    )
    const apiKeyProvider = await providerApiKeysRepository
      .find(input.id)
      .then((r) => r.unwrap())

    return await destroyProviderApiKey(apiKeyProvider)
      .then((r) => r.unwrap()!)
      .then(providerApiKeyPresenter)
  })
