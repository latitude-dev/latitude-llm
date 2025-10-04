'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { expirePromocode } from '@latitude-data/core/services/promocodes/expire'

export const expirePromocodeAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const expiredPromocodeResult = await expirePromocode({
      code: input.code,
    })
    return expiredPromocodeResult.unwrap()
  })
