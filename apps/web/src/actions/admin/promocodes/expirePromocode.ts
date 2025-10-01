'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { expirePromocode } from '@latitude-data/core/services/promocodes/expire'

export const expirePromocodeAction = withAdmin
  .inputSchema(z.object({ code: z.string() }))
  .action(async ({ parsedInput }) => {
    const expiredPromocodeResult = await expirePromocode({
      code: parsedInput.code,
    })
    return expiredPromocodeResult.unwrap()
  })
