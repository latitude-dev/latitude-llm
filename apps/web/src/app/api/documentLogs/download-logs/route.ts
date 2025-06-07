import {
  extendedDocumentLogFilterOptionsSchema,
  Workspace,
} from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { generateCsvFromLogs } from '@latitude-data/core/services/datasets/generateCsvFromLogs'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const downloadLogsRequestSchema = z.object({
  documentUuid: z.string(),
  extendedFilterOptions: extendedDocumentLogFilterOptionsSchema,
  staticColumnNames: z.array(z.string()),
  parameterColumnNames: z.array(z.string()),
})

export const POST = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const body = await request.json()
      const result = downloadLogsRequestSchema.safeParse(body)
      if (!result.success) {
        throw new BadRequestError(result.error.message)
      }
      const {
        documentUuid,
        extendedFilterOptions,
        staticColumnNames,
        parameterColumnNames,
      } = result.data

      const csvFile = await generateCsvFromLogs({
        workspace,
        documentUuid,
        extendedFilterOptions,
        columnFilters: {
          staticColumnNames,
          parameterColumnNames,
        },
      }).then((r) => r.unwrap())

      return new NextResponse(csvFile, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="data.csv"',
        },
      })
    },
  ),
)
