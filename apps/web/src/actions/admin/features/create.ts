'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { createFeature } from '@latitude-data/core/services/features/create'

export const createFeatureAction = withAdmin
  .inputSchema(
    z.object({
      name: z.string().min(1, { error: 'Name is required' }),
      description: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await createFeature({
      name: parsedInput.name,
      description: parsedInput.description,
    })

    return result.unwrap()
  })
