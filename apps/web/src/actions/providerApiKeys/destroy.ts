'use server'

import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyProviderApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.number().or(z.string()) }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKeyProvider = await findProviderApiKeyById({
      workspaceId: ctx.workspace.id,
      id: Number(parsedInput.id),
    })

    return await destroyProviderApiKey(apiKeyProvider)
      .then((r) => r.unwrap()!)
      .then(providerApiKeyPresenter)
  })
