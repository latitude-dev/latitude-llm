'use server'

import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { authProcedure } from '../procedures'
import { inputSchema } from './inputSchema'

export const createProviderApiKeyAction = authProcedure
  .createServerAction()
  .input(inputSchema)
  .handler(async ({ input, ctx }) => {
    return await createProviderApiKey({
      workspace: ctx.workspace,
      provider: input.provider,
      token: input.token,
      url: input.url,
      name: input.name,
      defaultModel: input.defaultModel,
      author: ctx.user,
      configuration: input.configuration,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
