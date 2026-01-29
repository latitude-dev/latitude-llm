'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'

export const updateProviderApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.coerce.number(), name: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const providerApiKeysRepository = new ProviderApiKeysRepository(
      ctx.workspace.id,
    )
    const providerApiKey = await providerApiKeysRepository
      .find(parsedInput.id)
      .then((r) => r.unwrap())

    return await updateProviderApiKeyName({
      providerApiKey,
      name: parsedInput.name,
      workspaceId: ctx.workspace.id,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
