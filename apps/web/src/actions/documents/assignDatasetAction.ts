'use server'

import { assignDataset } from '@latitude-data/core/services/documents/assignDataset'
import { withDataset } from '../procedures'

export const assignDatasetAction = withDataset.action(async ({ ctx }) => {
  return await assignDataset({
    document: ctx.document,
    dataset: ctx.dataset,
  }).then((r) => r.unwrap())
})
