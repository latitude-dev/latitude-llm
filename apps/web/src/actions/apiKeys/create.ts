'use server'

import { createApiKey } from '@latitude-data/core/services/apiKeys/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createApiKeyAction = authProcedure
  .inputSchema(
    z.object({
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) =>
    createApiKey({
      name: parsedInput.name,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap()),
  )
