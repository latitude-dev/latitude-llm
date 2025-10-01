'use server'

import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'
import { queues } from '@latitude-data/core/queues'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { documentLogFilterOptionsSchema } from '@latitude-data/core/constants'

export const downloadLogsAsyncAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT']),
      excludedDocumentLogIds: z.array(z.number()),
      filterOptions: documentLogFilterOptionsSchema,
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { user, document } = ctx
    const { selectionMode, excludedDocumentLogIds, filterOptions } = parsedInput
    const { defaultQueue } = await queues()

    defaultQueue.add('downloadLogsJob', {
      user,
      token: generateUUIDIdentifier(),
      document,
      selectionMode,
      filters: filterOptions,
      excludedDocumentLogIds,
    })
  })
