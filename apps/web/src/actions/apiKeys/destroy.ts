'use server'

import { findApiKeyById } from '@latitude-data/core/queries/apiKeys/findById'
import { destroyApiKey } from '@latitude-data/core/services/apiKeys/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKey = await findApiKeyById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.id,
    })

    return destroyApiKey(apiKey).then((r) => r.unwrap())
  })
