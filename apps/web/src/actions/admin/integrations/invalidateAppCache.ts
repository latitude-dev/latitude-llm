'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { invalidateAppCache } from '@latitude-data/core/services/integrations/pipedream/cache/invalidate'

export const invalidateAppCacheAction = withAdmin
  .inputSchema(
    z.object({
      nameSlug: z.string().min(1, { message: 'App slug is required' }),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await invalidateAppCache(parsedInput.nameSlug)
    return result.unwrap()
  })
