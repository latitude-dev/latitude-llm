'use server'

import { updateWorkspace } from '@latitude-data/core/services/workspaces/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const setDefaultProviderAction = authProcedure
  .inputSchema(
    z.object({
      defaultProviderId: z.number().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const updatedWorkspace = await updateWorkspace(ctx.workspace, {
      defaultProviderId: parsedInput.defaultProviderId,
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
