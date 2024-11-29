import {
  DEFAULT_PAGINATION_SIZE,
  LogSources,
  Workspace,
} from '@latitude-data/core/browser'
import { computeDocumentLogsQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { decodeParameters } from '$/services/helpers'

function parsePage(page: string | null): string {
  if (!page) return '1'

  const parsed = parseInt(page, 10)
  if (isNaN(parsed)) return '1'

  return parsed < 1 ? '1' : parsed.toString()
}

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
      const excludeErrors = searchParams.get('excludeErrors') === 'true'

      const page = parsePage(searchParams.get('page'))
      const pageSize =
        searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)

      const { commitIds: _commitIds, logSources: _logSources } =
        decodeParameters(req.nextUrl.search)
      const commitIds = (Array.isArray(_commitIds) ? _commitIds : [_commitIds])
        .filter((c) => c !== undefined)
        .map(Number)

      const logSources = (
        Array.isArray(_logSources) ? _logSources : [_logSources]
      ).filter((l) => l !== undefined) as LogSources[]

      const filterOptions = {
        commitIds,
        logSources,
      }

      if (!filterOptions.commitIds.length || !filterOptions.logSources.length) {
        return NextResponse.json([], { status: 200 })
      }

      const buildQueryFn = excludeErrors
        ? computeDocumentLogsQuery
        : computeDocumentLogsWithMetadataQuery

      const rows = await buildQueryFn({
        workspaceId: workspace.id,
        documentUuid,
        filterOptions,
        page,
        pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
