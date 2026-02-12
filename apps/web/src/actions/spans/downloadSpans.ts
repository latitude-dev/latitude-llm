'use server'

import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../procedures'
import { downloadSpans } from '@latitude-data/core/services/spans/downloadSpans'
import { spansFiltersSchema } from '$/lib/schemas/filters'
import { findSpanIdentifiersByDocumentLogUuids } from '@latitude-data/core/queries/spans/findByDocumentLogUuid'

export const downloadSpansAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT', 'PARTIAL']),
      selectedDocumentLogUuids: z.array(z.string()),
      excludedDocumentLogUuids: z.array(z.string()),
      filters: spansFiltersSchema.optional(),
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

    return downloadSpans({
      workspace: ctx.workspace,
      userId: ctx.user.id,
      documentUuid: ctx.document.documentUuid,
      selectionMode: parsedInput.selectionMode,
      selectedSpanIdentifiers,
      excludedSpanIdentifiers,
      filters: parsedInput.filters,
    }).then((r) => r.unwrap())
  })
