'use server'

import { findApiKeyById } from '@latitude-data/core/queries/apiKeys/findById'
import { updateApiKey } from '@latitude-data/core/services/apiKeys/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateApiKeyAction = authProcedure
  .inputSchema(z.object({ id: z.coerce.number(), name: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const apiKey = await findApiKeyById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.id,
    })

    return updateApiKey(apiKey, { name: parsedInput.name }).then((r) =>
      r.unwrap(),
    )
  })
