'use server'

import { z } from 'zod'
import { createDatasetEmptyRow } from '@latitude-data/core/services/datasetRows/createEmptyRow'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authProcedure } from '$/actions/procedures'

export const createDatasetRowAction = authProcedure
  .inputSchema(z.object({ datasetId: z.number() }))
  .action(async ({ ctx, parsedInput }) => {
    const datasetRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(parsedInput.datasetId)
      .then((r) => r.unwrap())

    return createDatasetEmptyRow({
      workspace: ctx.workspace,
      dataset,
    }).then((r) => r.unwrap())
  })
