'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { searchAppCacheKeys } from '@latitude-data/core/services/integrations/pipedream/cache/invalidate'

export const searchAppCacheKeysAction = withAdmin
  .inputSchema(
    z.object({
      searchTerm: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await searchAppCacheKeys(parsedInput.searchTerm)
    return result.unwrap()
  })
