'use server'

import { z } from 'zod'

import { withDocument } from '../procedures'
import { extendedDocumentLogFilterOptionsSchema } from '@latitude-data/core/browser'
import { defaultQueue } from '@latitude-data/core/queues'
import { findOrCreateDataset } from '@latitude-data/core/services/datasets/findOrCreate'
import { updateDatasetFromLogs } from '@latitude-data/core/services/datasets/updateFromLogs'

const MAX_SYNC_LOGS_BATCH_SIZE = 25

export const createDatasetFromLogsAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      extendedFilterOptions: extendedDocumentLogFilterOptionsSchema,
      count: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    if (input.count <= MAX_SYNC_LOGS_BATCH_SIZE) {
      const dataset = await findOrCreateDataset({
        name: input.name,
        author: ctx.user,
        workspace: ctx.workspace,
      }).then((r) => r.unwrap())

      const result = await updateDatasetFromLogs({
        workspace: ctx.workspace,
        documentUuid: ctx.document.documentUuid,
        dataset,
        extendedFilterOptions: input.extendedFilterOptions,
      }).then((r) => r.unwrap())

      return {
        mode: 'sync',
        result,
      }
    }

    defaultQueue.add('createDatasetFromLogsJob', {
      name: input.name,
      author: ctx.user,
      workspace: ctx.workspace,
      documentUuid: ctx.document.documentUuid,
      extendedFilterOptions: input.extendedFilterOptions,
    })

    return {
      mode: 'async',
    }
  })
