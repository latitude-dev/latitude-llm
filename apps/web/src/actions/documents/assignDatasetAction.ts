'use server'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { assignDataset } from '@latitude-data/core/services/documents/assignDataset'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const assignDatasetAction = withDocument
  .createServerAction()
  .input(
    z.object({
      datasetId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { datasetId } = input
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(datasetId).then((r) => r.unwrap())

    return await assignDataset({ document: ctx.document, dataset }).then((r) =>
      r.unwrap(),
    )
  })
