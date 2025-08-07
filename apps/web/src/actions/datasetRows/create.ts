'use server'

import { authProcedure } from '$/actions/procedures'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { createDatasetEmptyRow } from '@latitude-data/core/services/datasetRows/createEmptyRow'
import { z } from 'zod'

export const createDatasetRowAction = authProcedure
  .createServerAction()
  .input(z.object({ datasetId: z.number() }), { type: 'json' })
  .handler(async ({ ctx, input }) => {
    const datasetRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())

    return createDatasetEmptyRow({
      workspace: ctx.workspace,
      dataset,
    }).then((r) => r.unwrap())
  })
