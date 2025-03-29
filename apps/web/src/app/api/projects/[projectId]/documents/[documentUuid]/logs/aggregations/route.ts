import { Workspace } from '@latitude-data/core'
import { computeDocumentLogsAggregations } from '@latitude-data/core'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      const result = await computeDocumentLogsAggregations({
        workspace,
        documentUuid,
        filterOptions: queryParams.filterOptions,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
