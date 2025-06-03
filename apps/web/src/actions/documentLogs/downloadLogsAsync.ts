'use server'

import { withDocument } from '../procedures'
import { defaultQueue } from '@latitude-data/core/queues'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { downloadLogsRequestSchema } from '$/app/api/documentLogs/download-logs/route'

export const downloadLogsAsyncAction = withDocument
  .createServerAction()
  .input(downloadLogsRequestSchema)
  .handler(async ({ ctx, input }) => {
    const { user } = ctx
    const { extendedFilterOptions, staticColumnNames, parameterColumnNames } =
      input

    defaultQueue.add('downloadLogsJob', {
      user,
      token: generateUUIDIdentifier(),
      workspace: ctx.workspace,
      documentUuid: ctx.document.documentUuid,
      extendedFilterOptions,
      columnFilters: {
        staticColumnNames,
        parameterColumnNames,
      },
    })
  })
