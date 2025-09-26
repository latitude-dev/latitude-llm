'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { deletePromocode } from '@latitude-data/core/services/promocodes/delete'

export const deletePromocodeAction = withAdmin
  .inputSchema(z.object({ code: z.string() }))
  .action(async ({ parsedInput }) => {
    const deletedPromocodeResult = await deletePromocode({
      code: parsedInput.code,
    })
    return deletedPromocodeResult.unwrap()
  })
