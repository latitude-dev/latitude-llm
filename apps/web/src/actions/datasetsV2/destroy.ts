'use server'

import { DatasetsV2Repository } from '@latitude-data/core/repositories'
import { destroyDataset } from '@latitude-data/core/services/datasetsV2/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyDatasetAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { id } = input
    const repo = new DatasetsV2Repository(ctx.workspace.id)
    const dataset = await repo.find(id).then((r) => r.unwrap())

    return await destroyDataset({ dataset }).then((r) => r.unwrap())
  })
