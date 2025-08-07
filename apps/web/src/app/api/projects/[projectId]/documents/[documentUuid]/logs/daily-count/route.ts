import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { type NextRequest, NextResponse } from 'next/server'

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
      const days = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : undefined
      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({
          projectId: Number(projectId),
          documentUuid,
        })
        .then((r) => r.unwrap())

      const result = await computeDocumentLogsDailyCount({
        projectId: Number(projectId),
        documentUuid: document.documentUuid,
        filterOptions: queryParams.filterOptions,
        days: days,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
