'use server'

import { assignDataset } from '@latitude-data/core/services/documents/assignDataset'
import { withDataset, withDatasetSchema } from '../procedures'

export const assignDatasetAction = withDataset
  .inputSchema(withDatasetSchema.extend({}))
  .action(async ({ ctx }) => {
    return assignDataset({
      document: ctx.document,
      dataset: ctx.dataset,
    }).then((r) => r.unwrap())
  })
