import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/schema/types'
import { RunsRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          runUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, runUuid } = params

      const repository = new RunsRepository(workspace.id, projectId)
      const run = await repository.get({ runUuid }).then((r) => r.unwrap())

      return NextResponse.json(run, { status: 200 })
    },
  ),
)
