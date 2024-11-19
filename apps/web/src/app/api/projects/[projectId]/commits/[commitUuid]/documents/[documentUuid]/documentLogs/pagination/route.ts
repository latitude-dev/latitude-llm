import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadataCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ROUTES } from '$/services/routes'
import { NextRequest, NextResponse } from 'next/server'

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
type IParam = {
  evaluationId: number
  documentUuid: string
  commitUuid: string
  projectId: number
}

type IPagination = ReturnType<typeof buildPagination>
export const GET = errorHandler<IParam, IPagination>(
  authHandler<IParam, IPagination>(
    async (req: NextRequest, { params, workspace }) => {
      const searchParams = req.nextUrl.searchParams
      const commitsScope = new CommitsRepository(workspace.id)
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const commit = await commitsScope
        .getCommitByUuid({
          uuid: params.commitUuid,
          projectId: params.projectId,
        })
        .then((r) => r.unwrap())
      const queryFn = excludeErrors
        ? computeDocumentLogsCount
        : computeDocumentLogsWithMetadataCount
      const count = await queryFn({
        workspaceId: workspace.id,
        documentUuid: params.documentUuid,
        draft: commit,
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
