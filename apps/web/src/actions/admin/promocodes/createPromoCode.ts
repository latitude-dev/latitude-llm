'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { createPromocode } from '@latitude-data/core/services/promocodes/create'
import { QuotaType } from '@latitude-data/constants'

export const createPromocodeAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      code: z.string(),
      quotaType: z.string(),
      description: z.string(),
      amount: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    const createdPromocodeResult = await createPromocode({
      code: input.code,
      quotaType: input.quotaType as QuotaType,
      description: input.description,
      amount: input.amount,
    })
    return createdPromocodeResult.unwrap()
  })
