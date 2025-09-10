'use server'

import { z } from 'zod'
import { authProcedure, withRateLimit } from '$/actions/procedures'
import { claimPromocode } from '@latitude-data/core/services/promocodes/claimPromocode'

export const claimPromocodeAction = (
  await withRateLimit(authProcedure, {
    limit: 10,
    period: 60,
  })
)
  .createServerAction()
  .input(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { code } = input
    const result = await claimPromocode({ code, workspace })
    return result.unwrap()
  })
