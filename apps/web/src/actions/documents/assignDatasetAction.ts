'use server'

import { assignDataset } from '@latitude-data/core/services/documents/assignDataset'
import { withDataset } from '$/actions/evaluations/_helpers'

export const assignDatasetAction = withDataset
  .createServerAction()
  .handler(async ({ ctx }) => {
    return await assignDataset({
      document: ctx.document,
      dataset: ctx.dataset,
      datasetVersion: ctx.datasetVersion,
    }).then((r) => r.unwrap())
  })
