import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { getRun } from '@latitude-data/core/services/runs/get'
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
          runUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, runUuid } = params

      const run = await getRun({
        workspaceId: workspace.id,
        projectId,
        runUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(run, { status: 200 })
    },
  ),
)
