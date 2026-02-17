'use server'

import { updateProductAccess } from '@latitude-data/core/services/workspaces/updateProductAccess'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateProductAccessAction = authProcedure
  .inputSchema(
    z.object({
      promptManagerEnabled: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const updatedWorkspace = await updateProductAccess({
      workspace: ctx.workspace,
      promptManagerEnabled: parsedInput.promptManagerEnabled,
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
