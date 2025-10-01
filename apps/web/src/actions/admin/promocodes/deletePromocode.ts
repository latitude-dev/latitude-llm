'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { deletePromocode } from '@latitude-data/core/services/promocodes/delete'

export const deletePromocodeAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const deletedPromocodeResult = await deletePromocode({
      code: input.code,
    })
    return deletedPromocodeResult.unwrap()
  })
