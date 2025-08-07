import type { Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogs } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadata } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'

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
      const { projectId, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      if (queryParams.isEmptyResponse) {
        return NextResponse.json([], { status: 200 })
      }

      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const buildQueryFn = queryParams.excludeErrors
        ? computeDocumentLogs
        : computeDocumentLogsWithMetadata

      const rows = await buildQueryFn({
        document,
        filterOptions: queryParams.filterOptions,
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
