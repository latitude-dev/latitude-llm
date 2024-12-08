import { Workspace } from '@latitude-data/core/browser'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { listTraces } from '@latitude-data/core/services/traces/list'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
        params,
      }: { workspace: Workspace; params: { projectId: string } },
    ) => {
      const { searchParams } = request.nextUrl
      const page = Number(searchParams.get('page') || '1')
      const pageSize = Number(searchParams.get('pageSize') || '25')
      const filtersParam = searchParams.get('filters')
      const filters = filtersParam ? JSON.parse(filtersParam) : []

      const projectId = Number(params.projectId)
      const project = await new ProjectsRepository(workspace.id)
        .find(projectId)
        .then((r) => r.unwrap())

      const traces = await listTraces({
        project,
        page,
        pageSize,
        filters,
      }).then((r) => r.unwrap())

      return Response.json(traces)
    },
  ),
)
