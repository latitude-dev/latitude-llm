import { Workspace } from '@latitude-data/core/browser'
import { listTraces } from '@latitude-data/core/services/traces/list'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const { searchParams } = request.nextUrl
      const page = Number(searchParams.get('page') || '1')
      const pageSize = Number(searchParams.get('pageSize') || '25')
      const filtersParam = searchParams.get('filters')
      const filters = filtersParam ? JSON.parse(filtersParam) : []

      const traces = await listTraces({
        workspace,
        page,
        pageSize,
        filters,
      }).then((r) => r.unwrap())

      return Response.json(traces)
    },
  ),
)
