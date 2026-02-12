'use server'

import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../procedures'
import { queues } from '@latitude-data/core/queues'
import { findOrCreateDataset } from '@latitude-data/core/services/datasets/findOrCreate'
import { updateDatasetFromSpans } from '@latitude-data/core/services/datasets/updateFromSpans'
import { findSpanIdentifiersByDocumentLogUuids } from '@latitude-data/core/queries/spans/findByDocumentLogUuid'

const MAX_SYNC_SPANS_BATCH_SIZE = 25

export const createDatasetFromSpansAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      name: z.string(),
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT', 'PARTIAL']),
      selectedDocumentLogUuids: z.array(z.string()),
      excludedDocumentLogUuids: z.array(z.string()),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const selectedSpanIdentifiers =
      parsedInput.selectedDocumentLogUuids.length > 0
        ? await findSpanIdentifiersByDocumentLogUuids({
            workspaceId: ctx.workspace.id,
            documentLogUuids: parsedInput.selectedDocumentLogUuids,
          })
        : []

    const excludedSpanIdentifiers =
      parsedInput.excludedDocumentLogUuids.length > 0
        ? await findSpanIdentifiersByDocumentLogUuids({
            workspaceId: ctx.workspace.id,
            documentLogUuids: parsedInput.excludedDocumentLogUuids,
          })
        : []

    if (
      parsedInput.selectionMode === 'PARTIAL' &&
      selectedSpanIdentifiers.length <= MAX_SYNC_SPANS_BATCH_SIZE
    ) {
      const dataset = await findOrCreateDataset({
        name: parsedInput.name,
        author: ctx.user,
        workspace: ctx.workspace,
      }).then((r) => r.unwrap())

      const result = await updateDatasetFromSpans({
        dataset,
        workspace: ctx.workspace,
        spanIdentifiers: selectedSpanIdentifiers,
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
      selectedSpanIdentifiers,
      excludedSpanIdentifiers,
    })

    return {
      mode: 'async',
    }
  })
