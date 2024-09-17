'use server'

import { createApiKey } from '@latitude-data/core/services/apiKeys/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) =>
    createApiKey({
      name: input.name,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap()),
  )
