import { LogSources, Workspace } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { computeDocumentLogsCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadataCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ROUTES } from '$/services/routes'
import { NextRequest, NextResponse } from 'next/server'
import { decodeParameters } from '$/services/helpers'

function pageUrl(params: {
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  return ROUTES.projects
    .detail({ id: Number(params.projectId) })
    .commits.detail({ uuid: params.commitUuid })
    .documents.detail({ uuid: params.documentUuid }).logs.root
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
          evaluationId: number
          documentUuid: string
          commitUuid: string
          projectId: number
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

      const queryFn = excludeErrors
        ? computeDocumentLogsCount
        : computeDocumentLogsWithMetadataCount

      const count = await queryFn({
        workspaceId: workspace.id,
        documentUuid: params.documentUuid,
        filterOptions,
      })

      const pagination = buildPagination({
        baseUrl: pageUrl({
          projectId: params.projectId.toString(),
          commitUuid: params.commitUuid,
          documentUuid: params.documentUuid,
        }),
        count,
        page: searchParams.get('page')
          ? parseInt(searchParams.get('page') as string)
          : 1,
        pageSize: searchParams.get('pageSize')
          ? parseInt(searchParams.get('pageSize') as string)
          : 25,
      })

      return NextResponse.json(pagination, { status: 200 })
    },
  ),
)
