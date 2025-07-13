'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { toggleWorkspaceFeature } from '@latitude-data/core/services/workspaceFeatures/toggle'

export const toggleWorkspaceFeatureAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      featureId: z.number(),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const result = await toggleWorkspaceFeature(
      ctx.workspace.id,
      input.featureId,
      input.enabled,
    )

    return result.unwrap()
  })
