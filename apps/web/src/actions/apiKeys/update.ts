'use server'

import { updateApiKey } from '@latitude-data/core/services/apiKeys/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateApiKeyAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) =>
    updateApiKey({
      id: input.id,
      name: input.name,
      workspaceId: ctx.workspace.id,
    }).then((r) => r.unwrap()),
  )
