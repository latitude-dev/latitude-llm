import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsLimited } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { NextRequest, NextResponse } from 'next/server'
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
      if (queryParams.isEmptyResponse) {
        return NextResponse.json({ items: [], next: null }, { status: 200 })
      }

      const repository = new DocumentVersionsRepository(workspace.id)
      const document = await repository
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const result = await computeDocumentLogsLimited({
        document: document,
        from: queryParams.from,
        filters: queryParams.filterOptions,
      })

      return NextResponse.json(
        {
          items: result.items,
          next: result.next ? JSON.stringify(result.next) : null,
        },
        { status: 200 },
      )
    },
  ),
)
