'use server'

import { z } from 'zod'
import { withDocument } from '../procedures'
import { documentLogFilterOptionsSchema } from '@latitude-data/core/browser'
import { queues } from '@latitude-data/core/queues'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'

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
