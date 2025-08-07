'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { destroyFeature } from '@latitude-data/core/services/features/destroy'
import { FeaturesRepository } from '@latitude-data/core/repositories/featuresRepository'

export const destroyFeatureAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    const featuresRepo = new FeaturesRepository()
    const feature = await featuresRepo.find(input.id).then((r) => r.unwrap())

    const result = await destroyFeature(feature)
    return result.unwrap()
  })
