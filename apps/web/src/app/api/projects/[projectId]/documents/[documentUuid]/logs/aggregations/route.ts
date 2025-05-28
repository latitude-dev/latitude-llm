import { Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsAggregations } from '@latitude-data/core/services/documentLogs/computeDocumentLogsAggregations'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
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
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())
      const result = await computeDocumentLogsAggregations({
        document,
        filterOptions: queryParams.filterOptions,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
