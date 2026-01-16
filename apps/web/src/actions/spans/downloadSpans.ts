'use server'

import { z } from 'zod'

import { withDocument, withDocumentSchema } from '../procedures'
import { downloadSpans } from '@latitude-data/core/services/spans/downloadSpans'
import { spansFiltersSchema } from '$/lib/schemas/filters'

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
    return downloadSpans({
      workspace: ctx.workspace,
      userId: ctx.user.id,
      documentUuid: ctx.document.documentUuid,
      selectionMode: parsedInput.selectionMode,
      selectedSpanIdentifiers: parsedInput.selectedSpanIdentifiers,
      excludedSpanIdentifiers: parsedInput.excludedSpanIdentifiers,
      filters: parsedInput.filters,
    }).then((r) => r.unwrap())
  })
