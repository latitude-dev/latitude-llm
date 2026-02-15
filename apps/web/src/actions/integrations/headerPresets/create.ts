'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { createIntegrationHeaderPreset } from '@latitude-data/core/services/integrations/headerPresets/create'
import { findIntegrationById } from '@latitude-data/core/queries/integrations/findById'

const inputSchema = z.object({
  integrationId: z.number(),
  name: z.string().min(1, { message: 'Name is required' }).max(256),
  headers: z.record(z.string(), z.string()),
})

export const createIntegrationHeaderPresetAction = authProcedure
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }) => {
    await findIntegrationById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.integrationId,
    })

    const result = await createIntegrationHeaderPreset({
      integrationId: parsedInput.integrationId,
      workspaceId: ctx.workspace.id,
      name: parsedInput.name,
      headers: parsedInput.headers,
      authorId: ctx.user.id,
    })

    return result.unwrap()
  })
