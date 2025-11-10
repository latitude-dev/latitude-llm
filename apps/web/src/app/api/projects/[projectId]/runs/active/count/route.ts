import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { RunsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params

      const repository = new RunsRepository(workspace.id, projectId)
      const countBySource = await repository
        .countActiveBySource()
        .then((r) => r.unwrap())

      return NextResponse.json({ countBySource }, { status: 200 })
    },
  ),
)
