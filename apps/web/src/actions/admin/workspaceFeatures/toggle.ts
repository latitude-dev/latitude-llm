'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { toggleWorkspaceFeature } from '@latitude-data/core/services/workspaceFeatures/toggle'

export const toggleWorkspaceFeatureAction = withAdmin
  .inputSchema(
    z.object({
      featureId: z.number(),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await toggleWorkspaceFeature(
      ctx.workspace.id,
      parsedInput.featureId,
      parsedInput.enabled,
    )

    return result.unwrap()
  })
