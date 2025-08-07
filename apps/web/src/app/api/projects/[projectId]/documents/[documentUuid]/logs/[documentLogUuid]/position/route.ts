import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params: { documentLogUuid },
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
          documentLogUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      const result = await fetchDocumentLogWithPosition({
        workspace,
        documentLogUuid,
        filterOptions: queryParams.filterOptions,
        excludeErrors: queryParams.excludeErrors,
      })

      if (result.error) {
        return NextResponse.json(
          { message: `Document Log not found with uuid: ${documentLogUuid}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
