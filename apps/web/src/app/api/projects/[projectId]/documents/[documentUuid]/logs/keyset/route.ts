import { computeDocumentLogsKeyset } from '@latitude-data/core/services/documentLogs/computeDocumentLogsKeyset'
import { computeDocumentLogsWithMetadataKeyset } from '@latitude-data/core/services/documentLogs/computeDocumentLogsKeyset'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/types'

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

      // Extract cursor-based pagination parameters
      const after = searchParams.get('after') || undefined
      const before = searchParams.get('before') || undefined
      const limit = searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : undefined

      if (queryParams.isEmptyResponse) {
        return NextResponse.json(
          {
            data: [],
            hasNext: false,
            hasPrevious: false,
          },
          { status: 200 },
        )
      }

      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const buildQueryFn = queryParams.excludeErrors
        ? computeDocumentLogsKeyset
        : computeDocumentLogsWithMetadataKeyset

      const result = await buildQueryFn({
        document,
        filterOptions: queryParams.filterOptions,
        after,
        before,
        limit,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
