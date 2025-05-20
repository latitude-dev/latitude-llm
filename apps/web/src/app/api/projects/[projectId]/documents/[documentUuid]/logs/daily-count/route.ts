import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/browser'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        params,
      }: {
        workspace: Workspace
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
        }
      },
    ) => {
      const { projectId, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      const days = searchParams.get('days')
        ? parseInt(searchParams.get('days')!, 10)
        : undefined
      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({
          projectId: Number(projectId),
          documentUuid,
        })
        .then((r) => r.unwrap())

      const result = await computeDocumentLogsDailyCount({
        document,
        filterOptions: queryParams.filterOptions,
        days,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
