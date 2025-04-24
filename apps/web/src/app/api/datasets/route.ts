import { DEFAULT_PAGINATION_SIZE, Workspace } from '@latitude-data/core/browser'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parsePage } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const page = parsePage(searchParams.get('page'))
      const pageSize =
        searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)
      const scope = new DatasetsRepository(workspace.id)
      const rows = await scope.findAllPaginated({
        page,
        pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
