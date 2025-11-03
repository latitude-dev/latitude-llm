import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { RunSourceGroup } from '@latitude-data/constants'
import { RunsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params
      const searchParams = request.nextUrl.searchParams
      const page = searchParams.get('page')
      const pageSize = searchParams.get('pageSize')
      const sourceGroup = searchParams.get('sourceGroup') as
        | RunSourceGroup
        | undefined

      const repository = new RunsRepository(workspace.id, projectId)
      const runs = await repository
        .listCompleted({
          page: page ? Number(page) : undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
          sourceGroup,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(runs, { status: 200 })
    },
  ),
)
