'use server'

import { Providers } from '@latitude-data/core/browser'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createProviderApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      provider: z.nativeEnum(Providers),
      token: z.string(),
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    return await createProviderApiKey({
      workspace: ctx.workspace,
      provider: input.provider,
      token: input.token,
      name: input.name,
      author: ctx.user,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
