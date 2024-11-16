import { DEFAULT_PAGINATION_SIZE, DocumentLog } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/repositories'
import { computeDocumentLogsQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

function parsePage(page: string | null): string {
  if (!page) return '1'

  const parsed = parseInt(page, 10)
  if (isNaN(parsed)) return '1'

  return parsed < 1 ? '1' : parsed.toString()
}

type ResponseResult<T extends boolean> = T extends true
  ? DocumentLogWithMetadataAndError[]
  : DocumentLog[]

type IParams = {
  projectId: string
  commitUuid: string
  documentUuid: string
}

export const GET = errorHandler<IParams, ResponseResult<boolean>>(
  authHandler<IParams, ResponseResult<boolean>>(
    async (req: NextRequest, { params, workspace }) => {
      const { projectId, commitUuid, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId: Number(projectId),
          uuid: commitUuid ?? '',
        })
        .then((r) => r.unwrap())

      const page = parsePage(searchParams.get('page'))
      const pageSize =
        searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)
      const queryFn = excludeErrors
        ? computeDocumentLogsQuery
        : computeDocumentLogsWithMetadataQuery
      const rows = await queryFn({
        workspaceId: workspace.id,
        documentUuid,
        draft: commit,
        page,
        pageSize,
      })

      return NextResponse.json(rows, {
        status: 200,
      })
    },
  ),
)
