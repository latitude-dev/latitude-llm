import { LogSources, Workspace } from '@latitude-data/core/browser'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { decodeParameters } from '$/services/helpers'

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
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const { commitIds, logSources } = decodeParameters(req.nextUrl.search)
      const filterOptions = {
        commitIds: Array.isArray(commitIds) ? commitIds.map(Number) : [],
        logSources: (Array.isArray(logSources)
          ? logSources
          : []) as LogSources[],
      }

      const result = await fetchDocumentLogWithPosition({
        workspace,
        filterOptions,
        documentLogUuid,
        excludeErrors,
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
