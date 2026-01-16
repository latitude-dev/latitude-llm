'use server'

import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../procedures'
import { findOrCreateExport } from '@latitude-data/core/services/exports/findOrCreate'
import {
  enqueueExportSpansJob,
  ExportSpansJobData,
} from '@latitude-data/core/jobs/definitions'
import { spansFiltersSchema } from '$/lib/schemas/filters'

const MAX_SYNC_SPANS_BATCH_SIZE = 25

const spanIdentifierSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
})

export const downloadSpansAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT', 'PARTIAL']),
      selectedSpanIdentifiers: z.array(spanIdentifierSchema),
      excludedSpanIdentifiers: z.array(spanIdentifierSchema),
      filters: spansFiltersSchema.optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    if (
      parsedInput.selectionMode === 'PARTIAL' &&
      parsedInput.selectedSpanIdentifiers.length <= MAX_SYNC_SPANS_BATCH_SIZE
    ) {
      return {
        mode: 'sync' as const,
        spanIdentifiers: parsedInput.selectedSpanIdentifiers,
      }
    }

    const exportUuid = crypto.randomUUID()
    const fileKey = `exports/${exportUuid}.csv`

    await findOrCreateExport({
      uuid: exportUuid,
      workspace: ctx.workspace,
      userId: ctx.user.id,
      fileKey,
    }).then((r) => r.unwrap())

    const jobFilters: ExportSpansJobData['filters'] = {
      commitUuids: parsedInput.filters?.commitUuids,
      experimentUuids: parsedInput.filters?.experimentUuids,
      testDeploymentIds: parsedInput.filters?.testDeploymentIds,
      createdAt: parsedInput.filters?.createdAt,
    }

    await enqueueExportSpansJob({
      exportUuid,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      documentUuid: ctx.document.documentUuid,
      selectionMode: parsedInput.selectionMode,
      excludedSpanIdentifiers: parsedInput.excludedSpanIdentifiers,
      selectedSpanIdentifiers:
        parsedInput.selectionMode === 'PARTIAL'
          ? parsedInput.selectedSpanIdentifiers
          : undefined,
      filters: jobFilters,
    })

    return {
      mode: 'async' as const,
      exportUuid,
    }
  })
