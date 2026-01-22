'use server'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { destroyIntegrationHeaderPreset } from '@latitude-data/core/services/integrations/headerPresets/destroy'
import { IntegrationHeaderPresetsRepository } from '@latitude-data/core/repositories'

const inputSchema = z.object({
  presetId: z.number(),
})

export const destroyIntegrationHeaderPresetAction = authProcedure
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const presetsRepo = new IntegrationHeaderPresetsRepository(ctx.workspace.id)
    const preset = await presetsRepo
      .find(parsedInput.presetId)
      .then((r) => r.unwrap())

    const result = await destroyIntegrationHeaderPreset(preset)

    return result.unwrap()
  })
