'use server'

import { DatasetsV2Repository } from '@latitude-data/core/repositories'
import { toggleGoldenDataset } from '@latitude-data/core/services/datasetsV2/toggleGoldenDataset'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const toggleDatasetAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { id } = input
    const repo = new DatasetsV2Repository(ctx.workspace.id)
    const dataset = await repo.find(id).then((r) => r.unwrap())

    return await toggleGoldenDataset({ dataset }).then((r) => r.unwrap())
  })
