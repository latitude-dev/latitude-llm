import { Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsWithMetadataPaginated } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
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
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({
        searchParams,
      })
      if (queryParams.isEmptyResponse) {
        return NextResponse.json([], { status: 200 })
      }

      const rows = await computeDocumentLogsWithMetadataPaginated({
        workspace,
        documentUuid,
        filterOptions: queryParams.filterOptions,
        page: Number(queryParams.page),
        size: Number(queryParams.pageSize),
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
