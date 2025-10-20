'use server'

import { withAdmin } from '../../procedures'
import { invalidateFirstPageCache } from '@latitude-data/core/services/integrations/pipedream/cache/invalidate'

export const invalidateFirstPageCacheAction = withAdmin.action(async () => {
  const result = await invalidateFirstPageCache()
  return result.unwrap()
})
