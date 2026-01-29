'use server'

import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyProviderApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.number().or(z.string()) }))
  .action(async ({ parsedInput, ctx }) => {
    const providerApiKeysRepository = new ProviderApiKeysRepository(
      ctx.workspace.id,
    )
    const apiKeyProvider = await providerApiKeysRepository
      .find(Number(parsedInput.id))
      .then((r) => r.unwrap())

    return await destroyProviderApiKey(apiKeyProvider)
      .then((r) => r.unwrap()!)
      .then(providerApiKeyPresenter)
  })
