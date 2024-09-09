'use server'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'
import disk from '$/lib/disk'
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
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(id).then((r) => r.unwrap())

    return await destroyDataset({ dataset, disk }).then((r) => r.unwrap())
  })
