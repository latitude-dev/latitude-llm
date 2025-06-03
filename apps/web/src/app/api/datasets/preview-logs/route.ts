import {
  extendedDocumentLogFilterOptionsSchema,
  Workspace,
} from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { previewDatasetFromLogs } from '@latitude-data/core/services/datasets/previewFromLogs'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const previewLogsRequestSchema = z.object({
  documentUuid: z.string(),
  name: z.string().optional(),
  extendedFilterOptions: extendedDocumentLogFilterOptionsSchema,
  staticColumnNames: z.array(z.string()).optional(),
  parameterColumnNames: z.array(z.string()).optional(),
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
      const {
        name,
        documentUuid,
        extendedFilterOptions,
        staticColumnNames,
        parameterColumnNames,
      } = previewLogsRequestSchema.parse(body)
      const result = await previewDatasetFromLogs({
        workspace,
        documentUuid,
        name,
        extendedFilterOptions,
        columnFilters: {
          staticColumnNames,
          parameterColumnNames,
        },
      })

      if (result.error) {
        throw new BadRequestError(result.error.message)
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
