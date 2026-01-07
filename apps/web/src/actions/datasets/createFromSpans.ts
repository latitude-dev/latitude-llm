'use server'

import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../procedures'
import { queues } from '@latitude-data/core/queues'
import { findOrCreateDataset } from '@latitude-data/core/services/datasets/findOrCreate'
import { updateDatasetFromSpans } from '@latitude-data/core/services/datasets/updateFromSpans'

const MAX_SYNC_SPANS_BATCH_SIZE = 25

const spanIdentifierSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
})

export const createDatasetFromSpansAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      name: z.string(),
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT', 'PARTIAL']),
      selectedSpanIdentifiers: z.array(spanIdentifierSchema),
      excludedSpanIdentifiers: z.array(spanIdentifierSchema),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    if (
      parsedInput.selectionMode === 'PARTIAL' &&
      parsedInput.selectedSpanIdentifiers.length <= MAX_SYNC_SPANS_BATCH_SIZE
    ) {
      const dataset = await findOrCreateDataset({
        name: parsedInput.name,
        author: ctx.user,
        workspace: ctx.workspace,
      }).then((r) => r.unwrap())

      const result = await updateDatasetFromSpans({
        dataset,
        workspace: ctx.workspace,
        spanIdentifiers: parsedInput.selectedSpanIdentifiers,
      }).then((r) => r.unwrap())

      return {
        mode: 'sync',
        result,
      }
    }

    const { defaultQueue } = await queues()

    defaultQueue.add('createDatasetFromSpansJob', {
      name: parsedInput.name,
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      documentVersionId: ctx.document.id,
      selectionMode: parsedInput.selectionMode,
      selectedSpanIdentifiers: parsedInput.selectedSpanIdentifiers,
      excludedSpanIdentifiers: parsedInput.excludedSpanIdentifiers,
    })

    return {
      mode: 'async',
    }
  })
