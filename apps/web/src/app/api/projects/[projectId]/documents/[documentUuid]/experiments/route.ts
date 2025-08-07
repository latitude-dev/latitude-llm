import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params: { documentUuid },
        workspace,
      }: {
        params: { documentUuid: string }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const { page, pageSize } = parseApiDocumentLogParams({ searchParams })

      const scope = new ExperimentsRepository(workspace.id)
      const experiments = await scope.findByDocumentUuid({
        documentUuid,
        page: +page,
        pageSize: +pageSize,
      })

      return NextResponse.json(experiments, { status: 200 })
    },
  ),
)
