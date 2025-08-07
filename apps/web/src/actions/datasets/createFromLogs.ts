'use server'

import { z } from 'zod'

import { documentLogFilterOptionsSchema } from '@latitude-data/core/browser'
import { defaultQueue } from '@latitude-data/core/queues'
import { updateDatasetFromLogs } from '@latitude-data/core/services/datasets/createFromLogs'
import { findOrCreateDataset } from '@latitude-data/core/services/datasets/findOrCreate'
import { withDocument } from '../procedures'

const MAX_SYNC_LOGS_BATCH_SIZE = 25

export const createDatasetFromLogsAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT', 'PARTIAL']),
      selectedDocumentLogIds: z.array(z.number().or(z.string())),
      excludedDocumentLogIds: z.array(z.number().or(z.string())),
      filterOptions: documentLogFilterOptionsSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    if (
      input.selectionMode === 'PARTIAL' &&
      input.selectedDocumentLogIds.length <= MAX_SYNC_LOGS_BATCH_SIZE
    ) {
      const dataset = await findOrCreateDataset({
        name: input.name,
        author: ctx.user,
        workspace: ctx.workspace,
      }).then((r) => r.unwrap())

      const result = await updateDatasetFromLogs({
        dataset,
        workspace: ctx.workspace,
        documentLogIds: input.selectedDocumentLogIds as number[],
      }).then((r) => r.unwrap())

      return {
        mode: 'sync',
        result,
      }
    }

    defaultQueue.add('createDatasetFromLogsJob', {
      name: input.name,
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      documentVersionId: ctx.document.id,
      selectionMode: input.selectionMode,
      selectedDocumentLogIds: input.selectedDocumentLogIds,
      excludedDocumentLogIds: input.excludedDocumentLogIds,
      filterOptions: input.filterOptions,
    })

    return {
      mode: 'async',
    }
  })
