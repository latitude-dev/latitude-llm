'use server'

import { createFeature } from '@latitude-data/core/services/features/create'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const createFeatureAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      name: z.string().min(1, { message: 'Name is required' }),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const result = await createFeature({
      name: input.name,
      description: input.description,
    })

    return result.unwrap()
  })
