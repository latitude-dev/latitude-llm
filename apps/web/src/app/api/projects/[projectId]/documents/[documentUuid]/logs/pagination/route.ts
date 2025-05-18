import { Workspace } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { computeDocumentLogsCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadataCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ROUTES } from '$/services/routes'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'

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
          documentUuid: string
          // FIXME: This is broken! CommitUuid is not a non-existing parameter (check the route)
          commitUuid: string
          projectId: string
        }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const queryFn = excludeErrors
        ? computeDocumentLogsCount
        : computeDocumentLogsWithMetadataCount
      const { documentUuid, commitUuid, projectId } = params
      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({
          projectId: Number(projectId),
          documentUuid,
        })
        .then((r) => r.unwrap())

      const count = await queryFn({
        document,
        filterOptions: queryParams.filterOptions,
      })

      // FIXME: This is broken! CommitUuid is not a non-existing parameter (check the route)
      const pagination = buildPagination({
        baseUrl: pageUrl({
          commitUuid,
          projectId,
          documentUuid,
        }),
        count,
        page: +queryParams.page,
        pageSize: +queryParams.pageSize,
      })

      return NextResponse.json(pagination, { status: 200 })
    },
  ),
)
