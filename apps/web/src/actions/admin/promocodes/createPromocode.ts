'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { createPromocode } from '@latitude-data/core/services/promocodes/create'
import { QuotaType } from '@latitude-data/constants'

export const createPromocodeAction = withAdmin
  .inputSchema(
    z.object({
      code: z.string(),
      quotaType: z.enum(QuotaType),
      description: z.string(),
      amount: z.number(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const createdPromocodeResult = await createPromocode({
      code: parsedInput.code,
      quotaType: parsedInput.quotaType,
      description: parsedInput.description,
      amount: parsedInput.amount,
    })

    return createdPromocodeResult.unwrap()
  })
