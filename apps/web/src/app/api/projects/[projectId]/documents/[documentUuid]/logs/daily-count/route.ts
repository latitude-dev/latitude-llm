import { Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'

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
      const days = searchParams.get('days')
        ? parseInt(searchParams.get('days')!, 10)
        : undefined
      const result = await computeDocumentLogsDailyCount({
        workspace,
        documentUuid,
        filterOptions: queryParams.filterOptions,
        days,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
