'use server'

import { createProviderApiKey } from '@latitude-data/core'
import { Providers } from '@latitude-data/core/browser'
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
      provider: input.provider as Providers,
      token: input.token,
      name: input.name,
      authorId: ctx.user.id,
    })
      .then((r) => r.unwrap())
      .then(providerApiKeyPresenter)
  })
