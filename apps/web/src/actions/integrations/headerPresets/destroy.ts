'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { destroyIntegrationHeaderPreset } from '@latitude-data/core/services/integrations/headerPresets/destroy'
import { findIntegrationHeaderPresetById } from '@latitude-data/core/queries/integrationHeaderPresets/findById'

const inputSchema = z.object({
  presetId: z.number(),
})

export const destroyIntegrationHeaderPresetAction = authProcedure
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const preset = await findIntegrationHeaderPresetById({
      workspaceId: ctx.workspace.id,
      id: parsedInput.presetId,
    })

    const result = await destroyIntegrationHeaderPreset(preset)

    return result.unwrap()
  })
