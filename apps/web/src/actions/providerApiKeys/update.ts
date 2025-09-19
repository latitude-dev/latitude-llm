'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'

export const updateProviderApiKeyAction = authProcedure
  .createServerAction()
  .input(z.object({ id: z.coerce.number(), name: z.string() }))
  .handler(async ({ input, ctx }) => {
    const providerApiKeysRepository = new ProviderApiKeysRepository(
      ctx.workspace.id,
    )
    const providerApiKey = await providerApiKeysRepository
      .find(input.id)
      .then((r) => r.unwrap())

    return await updateProviderApiKeyName({
      providerApiKey,
      name: input.name,
      workspaceId: ctx.workspace.id,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
