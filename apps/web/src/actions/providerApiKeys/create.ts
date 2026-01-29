'use server'

import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { authProcedure } from '../procedures'
import { inputSchema } from './inputSchema'

export const createProviderApiKeyAction = authProcedure
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }) => {
    return await createProviderApiKey({
      workspace: ctx.workspace,
      provider: parsedInput.provider,
      token: parsedInput.token,
      url: parsedInput.url,
      name: parsedInput.name,
      defaultModel: parsedInput.defaultModel,
      author: ctx.user,
      configuration: parsedInput.configuration,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
