'use server'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import disk from '$/lib/disk'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const previewDatasetAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(input.id).then((r) => r.unwrap())
    return await previewDataset({ dataset, disk }).then((r) => r.unwrap())
  })
