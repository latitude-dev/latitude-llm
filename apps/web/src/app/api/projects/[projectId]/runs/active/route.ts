import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/schema/types'
import { RunsRepository } from '@latitude-data/core/repositories'
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
      const { page, pageSize } = Object.fromEntries(
        request.nextUrl.searchParams.entries(),
      )

      const repository = new RunsRepository(workspace.id, projectId)
      const runs = await repository
        .listActive({
          page: page ? Number(page) : undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(runs, { status: 200 })
    },
  ),
)
