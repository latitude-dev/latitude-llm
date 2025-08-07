'use server'

import { documentLogFilterOptionsSchema } from '@latitude-data/core/browser'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { defaultQueue } from '@latitude-data/core/queues'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const downloadLogsAsyncAction = withDocument
  .createServerAction()
  .input(
    z.object({
      selectionMode: z.enum(['ALL', 'ALL_EXCEPT']),
      excludedDocumentLogIds: z.array(z.number()),
      filterOptions: documentLogFilterOptionsSchema,
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { user, document } = ctx
    const { selectionMode, excludedDocumentLogIds, filterOptions } = input

    defaultQueue.add('downloadLogsJob', {
      user,
      token: generateUUIDIdentifier(),
      document,
      filters: filterOptions,
      selectionMode,
      excludedDocumentLogIds,
    })
  })
