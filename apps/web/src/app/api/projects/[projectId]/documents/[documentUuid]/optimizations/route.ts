import { parsePage, parsePageSize } from '$/lib/parseUtils'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { OptimizationsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
      const page = parsePage(searchParams.get('page'))
      const pageSize = parsePageSize(searchParams.get('pageSize'))

      const repository = new OptimizationsRepository(workspace.id)
      const optimizations = await repository
        .listByDocumentWithDetails({ documentUuid, page, pageSize })
        .then((r) => r.unwrap())

      return NextResponse.json(optimizations, { status: 200 })
    },
  ),
)
