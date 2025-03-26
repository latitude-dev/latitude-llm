'use server'

import { z } from 'zod'
import { createDatasetEmptyRow } from '@latitude-data/core/services/datasetRows/createEmptyRow'
import { DatasetsV2Repository } from '@latitude-data/core/repositories'
import { authProcedure } from '$/actions/procedures'

export const createDatasetRowAction = authProcedure
  .createServerAction()
  .input(z.object({ datasetId: z.number() }), { type: 'json' })
  .handler(async ({ ctx, input }) => {
    const datasetRepo = new DatasetsV2Repository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())

    return createDatasetEmptyRow({
      workspace: ctx.workspace,
      dataset,
    }).then((r) => r.unwrap())
  })
