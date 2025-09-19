'use server'

import { z } from 'zod'
import { errorHandlingProcedure, withRateLimit } from '$/actions/procedures'
import { claimPromocode } from '@latitude-data/core/services/promocodes/claimPromocode'

export const claimPromocodeAction = errorHandlingProcedure
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    z.object({
      code: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { code } = parsedInput
    const result = await claimPromocode({ code, workspace: workspace! })
    return result.unwrap()
  })
