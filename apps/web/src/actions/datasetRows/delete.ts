'use server'

import { z } from 'zod'
import { deleteManyRows } from '@latitude-data/core/services/datasetRows/deleteManyRows'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { authProcedure } from '$/actions/procedures'

export const deleteRowsAction = authProcedure
  .inputSchema(
    z.object({
      datasetId: z.number(),
      rowIds: z.array(z.number()),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const datasetRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(parsedInput.datasetId)
      .then((r) => r.unwrap())
    const scope = new DatasetRowsRepository(ctx.workspace.id)
    const rows = await scope.findManyByDataset({
      dataset,
      rowIds: parsedInput.rowIds,
    })

    return deleteManyRows({
      dataset,
      rows,
    }).then((r) => r.unwrap())
  })
