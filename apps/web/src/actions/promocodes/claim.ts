'use server'

import { z } from 'zod'
import { authProcedure, withRateLimit } from '$/actions/procedures'
import { claimPromocode } from '@latitude-data/core/services/promocodes/claimPromocode'

export const claimPromocodeAction = authProcedure
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    z.object({
      code: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { code } = parsedInput
    console.log('workspace', workspace)
    const result = await claimPromocode({ code, workspace: workspace! })
    return result.unwrap()
  })
