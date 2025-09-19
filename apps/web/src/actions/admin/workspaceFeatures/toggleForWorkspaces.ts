'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { toggleWorkspaceFeatureForMultipleWorkspaces } from '@latitude-data/core/services/workspaceFeatures/toggleForMultipleWorkspaces'

export const toggleFeatureForWorkspacesAction = withAdmin
  .inputSchema(
    z.object({
      featureId: z.number(),
      workspaceIds: z.array(z.number()),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await toggleWorkspaceFeatureForMultipleWorkspaces(
      parsedInput.featureId,
      parsedInput.workspaceIds,
      parsedInput.enabled,
    )

    return result.unwrap()
  })
