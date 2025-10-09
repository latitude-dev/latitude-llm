'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { toggleFeatureGlobally } from '@latitude-data/core/services/features/toggleGlobally'

export const toggleFeatureGloballyAction = withAdmin
  .inputSchema(
    z.object({
      featureId: z.number(),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await toggleFeatureGlobally(
      parsedInput.featureId,
      parsedInput.enabled,
    )

    return result.unwrap()
  })
